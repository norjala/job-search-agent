# Lessons Learned

Distilled from the 2026-04-11 debugging marathon. See `incident-log.md` for the narrative, `scheduling-setup.md` for the operational guide. This file is for future-me debugging the next failure — read the TL;DR first, drop into the specific category for depth.

## TL;DR — the 5 rules that would have saved 6 hours

1. **SSH tests lie.** SSH-spawned bash inherits Full Disk Access from `sshd`'s security session; launchd-spawned bash does not. Never verify a launchd job by running it manually from SSH or directly from your terminal — the result will look successful even when the scheduled run would fail identically every time. **The only valid test is `launchctl kickstart -k gui/$UID/<label>`** followed by tailing the script's own log.

2. **macOS scheduled jobs need `/bin/bash` granted Full Disk Access.** System Settings → Privacy & Security → Full Disk Access → click `+` → ⌘⇧G → `/bin` → select `bash`. Without this, any launchd-spawned bash (and its children — claude, node, python, etc.) touching `~/Documents/` fails silently with `Operation not permitted`. This is a manual GUI step — **macOS blocks programmatic TCC changes since 10.14**, so no `tccutil grant`, no SQLite edit of `TCC.db`, no workaround. Budget 30 seconds for the user's click.

3. **`crontab -l` is mandatory whenever a scheduled job misbehaves.** A leftover crontab entry and a new LaunchAgent can run the same job in parallel for weeks without anyone noticing. On 2026-04-11, cron had been firing the agent every 8 AM and crashing on the default 256 FD limit — completely invisible because it wrote to a different log file than the LaunchAgent. First diagnostic: `crontab -l` + `launchctl list | grep <label>`, not "is the plist loaded?".

4. **CPU-time-over-elapsed is the gold standard for hang detection.** A stuck claude shows ~0.01 CPU seconds after 5+ minutes elapsed. A healthy one shows 5–10% average (e.g. 54 seconds of CPU in 10 minutes elapsed). `ps -p $pid -o etime,time,command` is the fastest diagnostic — two numbers and you know. Don't trust `launchctl list` showing "running" or the script log saying "started" — check the CPU-time ratio.

5. **Health canaries use filesystem truth, not agent-written text.** `stat -f %m <file>` is authoritative. Anything the agent writes *into* a file (last-run timestamps, status strings) can be hallucinated, wrong-timezone, or future-dated. On 2026-04-11 the agent wrote `_Last run: 2026-04-11 18:45_` at 15:41 actual time. mtime doesn't lie.

---

## Category 1 — macOS + launchd + TCC specifics

### TCC is per-file granular, not per-directory

Contrary to "~/Documents is a protected zone," macOS TCC has per-file rules. Today's probe found:

| File inside `~/Documents/Obsidian/` | launchd-bash without FDA |
|---|---|
| `.claude/agents/job-search-agent.md` | ✅ readable |
| `work/job-search/_intake.md` | ❌ `Operation not permitted` |
| `work/job-search/pipeline.md` | ❌ blocked |
| `work/job-search/_daily-digest.md` (append) | ❌ blocked |
| New file touched in `work/job-search/` | ✅ works (metadata op) |

Files inside a `.claude/` subdirectory happened to be readable. Sibling data files weren't. **Don't assume uniform TCC behavior across a single "protected" directory** — when in doubt, probe each file you need.

### Metadata ops vs content ops have different TCC codepaths

Without FDA, launchd-bash can:
- ✅ `touch newfile` (create empty file)
- ✅ `rm oldfile` (unlink)
- ✅ `stat existingfile` (metadata read)
- ✅ `mkdir newdir`

But cannot:
- ❌ `head existingfile` (content read)
- ❌ `printf text >> existingfile` (append)
- ❌ `cat existingfile > other` (read+write)

This split is why the TCC bug was so hard to diagnose: the install-time smoke test happened to use metadata-only ops (create log dir, touch probe file) and passed, while the real run-time ops (read intake, append digest footer) failed.

### macOS `ps -o etime=` (NOT `etimes=`)

Linux `ps` supports `etimes=` (elapsed seconds). macOS does not — only `etime=` with format `[[DD-]HH:]MM:SS`. Any process-age parser that works on Linux will silently error on macOS with the ps usage banner treated as a value. A portable bash parser:

```bash
parse_etime_to_seconds() {
  local etime="$1" days=0 a b c h=0 m=0 s=0
  if [[ "$etime" == *-* ]]; then days="${etime%%-*}"; etime="${etime#*-}"; fi
  IFS=: read -r a b c <<< "$etime"
  if [ -n "$c" ]; then h="$a"; m="$b"; s="$c"
  elif [ -n "$b" ]; then h=0; m="$a"; s="$b"
  else h=0; m=0; s="${a:-0}"
  fi
  h=$((10#${h:-0})); m=$((10#${m:-0})); s=$((10#${s:-0})); days=$((10#${days:-0}))
  echo $((days * 86400 + h * 3600 + m * 60 + s))
}
```

The `10#` prefix is required to force base-10 interpretation so a leading-zero value like `08` doesn't get parsed as octal. See `bin/run-daily.sh`, `bin/run-weekly.sh`, `bin/health-check.sh` for the in-use versions.

### sshd inherits FDA; launchd does not

macOS grants certain services Full Disk Access by default (or via prior interactive grants). Remote Login (sshd) is typically granted FDA on systems where it's enabled, because every SSH session then inherits that access. **This is why every manual test from an SSH session worked while the launchd runs failed identically** — the bash you're running from SSH has a completely different TCC context than the bash launchd will spawn.

Corollary: any "I'll just ssh in and test it" approach to verifying a launchd job will produce false confidence. You are **literally running in a different security sandbox**. The only valid test is to kickstart the agent via launchctl and read the artifacts.

### `pgrep -f "pattern"` can match itself in ad-hoc shells

When you run `pgrep -af "claude.*--agent"` from an interactive SSH command, the shell that's running `pgrep` has that pattern in its argv. macOS pgrep excludes its own PID but may not exclude the parent shell's PID. Result: spurious "matches" from your own debug command.

In production scripts, this is fine because the script's argv is its file path, not the pattern. But in interactive diagnostics, pick patterns that won't appear in your own command, or cross-reference PIDs with `ps -p $pid -o command=` to filter.

---

## Category 2 — Debugging discipline

### CPU-time-over-elapsed separates "slow" from "stuck"

| Metric | Meaning |
|---|---|
| 0.01s CPU / 5 min elapsed | Stuck — not making progress |
| 2s CPU / 30s elapsed = ~7% | Healthy early agent startup |
| 50s CPU / 10 min elapsed = ~8% | Healthy mid-run, lots of network I/O |
| 180s CPU / 3 min elapsed = 100% | Actively CPU-bound (parsing, computing) |
| 600s CPU / 10 min elapsed = 100% | Maybe a runaway loop, investigate |

For claude agents doing web searches + file I/O, normal is 5–10% average CPU. Anything under 1% for minutes is a hang, not slowness. **Watch the ratio, not the absolute CPU.**

### Wrong theories compound — verify fixes through the production code path

Today I went through 4 wrong theories before finding the real cause:

1. "Plists got unloaded Apr 7–9" → wrong, they were loaded the whole time
2. "Scripts being inside `~/Documents/` is the TCC issue" → half-right, moving them was necessary but not sufficient
3. "Orphan 5-day-old claude sessions hold a shared session lock" → coincidence, not cause
4. "The daily workflow prompt has a deadlock not in simpler prompts" → the prompt was fine

Each wrong theory had its own "fix" that seemed to work briefly because of **confounding factors** (SSH-bash FDA inheritance, the cron zombies hitting FD limits, my 10-minute watchdog killing a healthy 15-minute run and making it look stuck). Every one of these "fixes" was verified in a context that inherited FDA from sshd, so of course they appeared to work.

**Rule**: after any fix, verify in the actual production code path. For launchd jobs, that means `launchctl kickstart -k` followed by reading the script's own log and checking `last exit code` via `launchctl print`. Never "I ran it in my terminal and it worked."

### "Something just worked" is a signal to investigate, not a resolution

When my streaming test at 15:26 completed cleanly but the launchd kickstart at 15:43 hung with 0 CPU, the correct response was **"what's different between these two invocations?"** Instead I assumed the kill-the-orphans had fixed something — a coincidence mistaken for causation.

Rule: when a previously-broken thing starts working, **investigate why before declaring victory**. Otherwise the same thing will break again tomorrow for the same reason and you'll go through the full debugging cycle again.

### Watchdog timeouts need to match real-run baselines

My first streaming test used a 10-minute watchdog. The Apr 10 baseline was 14 minutes. The test killed a healthy run and made it look like a hang. I spent 20 minutes diagnosing a "hang" that was actually normal duration.

Rule: before setting a timeout on something that has a real production runtime, check the baseline. For the job-search agent, use 25+ minutes. For smaller tasks, 3x expected duration. Timeouts exist to catch hangs, not to catch slow-but-working runs.

### Diagnose before rebuilding

I rebuilt the entire runtime layer (4 hours: new repo, scripts, plists, installer, health-check, reaper) **before** finding the real root cause. The rebuild was still valuable — it fixed real architectural problems (non-version-controlled scripts, no idempotent recovery, manual canary checks) — but the FDA grant alone would have resolved the immediate symptom in 30 seconds.

Rule: when a scheduled job fails, **isolate the smallest failing repro first**, then design the fix. A minimal `launchctl kickstart` of a probe plist would have shown `Operation not permitted` in the launchd stderr immediately. That's 5 minutes of diagnostic before any rebuild.

---

## Category 3 — Architecture principles

### System code in version control, data in the vault

The pre-rebuild architecture had runtime scripts (`.sh`), LaunchAgent plists, and log files living inside the Obsidian vault at `~/Documents/Obsidian/work/job-search/`. This violated Jaron's own vault rule ("Do not write non-Markdown files into the vault") and caused real problems:

- Obsidian Sync only ships markdown, so the scripts lived only on the Mac Mini with no cross-machine copy or git history
- When the scripts got corrupted or went missing, there was no `git log` to diagnose, no `git checkout` to recover
- The scripts shared the vault's TCC protection (until moved out)

The rebuild moved runtime code to `~/Workspace/job-finder-agent/` (git-backed, both machines) and kept only markdown data in the vault. **Where something lives matters operationally — not just for tidiness.**

### Idempotent installers beat manual recovery

Pre-rebuild: every recovery was a 15-step manual sequence (recreate script, write plist, unload, load, set perms, verify TCC, tail logs, hope). Post-rebuild: `./bin/install.sh --repair` is one command, idempotent, self-verifying.

Manual recovery steps compound error — the more you have to remember, the higher the chance of skipping one and thinking you're done. Automating recovery is not a nice-to-have; it's what keeps the system reliable across months.

### Defense in depth beats any single safeguard

The current job-search runtime uses 8 compounding defenses:

1. **Version-controlled repo** — can `git log` and `git checkout` to see history / recover
2. **Idempotent installer** — one command re-setups the entire launchd layer
3. **Stale-process reaper** — `bin/run-daily.sh` kills any `claude --print --agent job-search-agent` older than 30 minutes before starting
4. **FD limit bump** — `ulimit -n 10240` in the wrapper prevents parallel-web-search crashes
5. **FDA grant** — the foundational fix; must be in place on each machine
6. **mtime-based canary** — health-check uses filesystem truth, not agent-written timestamps
7. **Hourly health LaunchAgent** — detects stale digest, attempts self-heal, exits cleanly if a run is in progress
8. **`/daily` hard-block on `_HEALTH_ALERT.md`** — a file presence check that the morning ritual can't bypass, ensuring silent outages become loud within 26 hours

Each defense addresses a different failure mode. Losing any one doesn't bring down the system. The previous architecture had only the manual morning canary check — which failed 3+ times.

### Health canaries must use filesystem truth

Any agent-written field in a file (timestamps, status strings, counts) is subject to:
- Hallucination (model makes up a number)
- Wrong timezone
- Wrong format (yyyy-dd-mm instead of yyyy-mm-dd)
- Future-dated (agent picks a schedule time instead of actual run time)

Filesystem mtime (`stat -f %m` on macOS, `stat -c %Y` on Linux) bumps on every write, cannot be lied about by the agent, and is the only robust source of "did something run." Use it for canaries.

### Enforce rules automatically, not via manual checklists

The old canary — "glance at `_daily-digest.md` first thing in the morning" — failed 3 times in 5 days. Humans don't reliably perform daily checklist items, especially when things usually work. Every manual checklist item is a future failure point.

The `/daily` hard-block on `_HEALTH_ALERT.md` is the replacement: the morning ritual physically cannot proceed past a stale-agent detection. The enforcement is in the code, not in willpower. Rule: if you notice yourself writing "remember to check X," replace it with a hard-block.

---

## Category 4 — Investigation process

### Isolate the smallest repro before designing the fix

Today's correct first move would have been:

1. `crontab -l` (shows the shadow scheduler)
2. `launchctl print gui/$UID/com.jaron.job-search-daily | grep "last exit"` (shows exit code 126)
3. `cat /tmp/job-search-agent-launchd.err` (shows `Operation not permitted`)
4. Write a 20-line minimal probe plist that just touches vault files via launchd-bash
5. Observe: metadata ops succeed, content ops fail
6. Conclusion: it's TCC, fix is the FDA grant

Total time: ~15 minutes. The 6-hour rebuild was valuable but became the path only because step 1 was skipped.

### Always check `crontab -l` for scheduled-job incidents

The shadow cron entries firing daily and crashing on FD limits were invisible for weeks. Neither the LaunchAgent nor the cron was writing to the visible digest (cron crashed early, LaunchAgent hit TCC). To the outside observer, "the scheduler was down" — but actually two separate schedulers were both quietly failing for different reasons.

Shadow schedulers are an extremely common class of bug on machines with long histories. `crontab -l`, `launchctl list`, `systemctl list-timers`, `atq` — check all applicable scheduler surfaces. Use the one that matches the OS and the likely suspects.

### The `/tmp/*-launchd.err` file is your friend

macOS launchd's `StandardErrorPath` in a plist captures errors from the launchd-level machinery (chdir failures, exec failures, TCC blocks) that the child script's own logging would miss. Every plist should set this to a predictable path. When a scheduled job misbehaves, the first file to read is the launchd err log, not the script's log.

### Read the setup doc you wrote last time

The pre-rebuild setup doc at `work/job-search/mac-mini-scheduling-setup.md` literally said:

> **macOS TCC (Transparency, Consent, Control) — the silent killer**
>
> Symptom: `/tmp/job-search-agent-launchd.err` contains lines like `Operation not permitted`
>
> Two ways to fix it: (1) move the scripts outside `~/Documents/`, (2) grant `/bin/bash` Full Disk Access.

We shipped option (1) and never did option (2). The lesson is in the doc, it just wasn't followed. When a problem recurs, **re-read any existing post-mortem first** — past-you probably already knew.

### Document theories with evidence, not just conclusions

The first pass of today's incident log read "TCC blocked launchd, fixed by moving scripts to ~/Workspace/." That conclusion was **wrong** and the lesson was misleading — the real fix was the FDA grant. When a theory is later disproven, the doc must be updated; otherwise future-you will act on a false lesson and waste time replicating the wrong fix.

See the late update in `incident-log.md` for the corrected story. Always add an "updated" or "correction" section rather than silently editing — future-you wants to see the progression, not just the final conclusion, because the progression itself is educational.

---

## Cross-references

- [`docs/incident-log.md`](./incident-log.md) — the chronological narrative including the 3+ wrong theories and their correction
- [`docs/scheduling-setup.md`](./scheduling-setup.md) — operational guide with diagnostic commands, the FDA grant walkthrough, and health-check details
- `bin/run-daily.sh` / `bin/run-weekly.sh` — where the reaper and FD bump live; grep for `parse_etime_to_seconds` to see the ps-etime portable parser
- `bin/health-check.sh` — mtime-based canary implementation
- `launchd/*.plist` — `WorkingDirectory` must be outside `~/Documents/` so launchd's pre-exec chdir doesn't hit TCC

## Meta — when to update this file

Add a new entry when:
- A new failure mode is discovered
- A theory in this file turns out to be wrong or incomplete
- A new defense layer is added to the runtime
- A new macOS version changes TCC behavior (check after major OS updates)

Don't delete old entries — **the wrong theories are themselves educational** and future-me benefits from seeing the debugging progression.
