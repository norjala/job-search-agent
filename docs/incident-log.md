# Job Search Agent — Incident Log

A running record of silent failures, their root causes, and the fixes. If you're debugging a new failure, start here — the same symptom has probably happened before.

---

## 2026-04-11 — TCC silently blocks every scheduled run (3-day recurring incident)

**Symptom**
- `_daily-digest.md` header stuck at `_Last run: 2026-04-10 09:00_` on the morning of Apr 11
- 4 unprocessed URLs piled up in `_intake.md` under `## New`
- User reported the same symptom twice in 5 days — first blamed on "plists got unloaded Apr 7–9", patched by reloading them Apr 10, then recurred Apr 11

**Observed evidence on the Mac Mini**
```
$ launchctl list | grep job-search
-	126	com.jaron.job-search-daily     # ← exit code 126 = permission denied
-	0	com.jaron.job-search-weekly

$ cat /tmp/job-search-agent-launchd.err
shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted
/bin/bash: /Users/jaron/Documents/Obsidian/work/job-search/run-job-search-agent.sh: Operation not permitted
(× 3 — one pair for each attempted 8 AM run)
```

**Root cause**
Both the script path (`~/Documents/Obsidian/work/job-search/run-job-search-agent.sh`) and the plist's `WorkingDirectory` (`~/Documents/Obsidian`) live inside macOS's TCC-protected zone. **launchd itself does not have Full Disk Access**, so when the plist instructs it to chdir into `~/Documents/Obsidian` BEFORE spawning `/bin/bash`, the chdir fails with `getcwd: cannot access parent directories: Operation not permitted`. Even if bash has FDA granted (which it may, from a prior grant), bash never gets a chance to run — the failure happens in launchd's pre-exec setup. Then bash is invoked pointing at a script path that's also in the TCC zone, which compounds the error. Exit code 126 is macOS's "could not execute file" signal.

The subtle trap is that the fix is **NOT** "grant /bin/bash FDA." That alone does nothing because launchd is the process doing the failing chdir, not bash. The fix is to move both the `WorkingDirectory` AND the script path OUTSIDE of `~/Documents/`. Once launchd can chdir and exec bash, bash's own FDA grant (if present) — or the FDA grant on `/opt/homebrew/bin/node` that `claude` runs under — handles the subsequent vault reads transparently.

An earlier diagnostic probe misled the investigation: running `head` on a vault file from a launchd-spawned bash with `WorkingDirectory` outside the vault failed with `Operation not permitted`. That turned out to be TCC applying per-binary: `/usr/bin/head` is a separate process with its own TCC context and lacks FDA, so it fails to read. But `bash`'s own builtins (`cd`, `printf`, `[ ]`) and `node` (used by `claude`) both have FDA, so the real production path — `bash → cd → claude → node → vault` — works where `bash → exec head → vault` did not. **Never use `/usr/bin/head` or other one-shot binaries to test TCC; the results are misleading.**

The "Apr 7–9 plist unloaded" theory from the prior incident was wrong. Re-inspection showed the plists were loaded the entire time; every scheduled 8 AM run for at least five days had been silently failing with TCC errors. The Apr 10 `_daily-digest.md` "success" was a manual run Jaron triggered at 00:19 AM over SSH, which inherits sshd's FDA grant and therefore bypassed TCC entirely.

**Why it kept recurring**
1. Symptoms only appeared when looking at the digest header 12+ hours after the failed 8 AM run. Detection was manual, delayed, and easy to miss.
2. Manual recovery ran from an interactive SSH shell, which masked the TCC problem — making the scheduled-run bug look like a transient "launchd hiccup."
3. The vault's own setup doc flagged TCC as "the silent killer" in writing but the fix was never actually applied.
4. Scripts lived in the Obsidian vault, so they couldn't be tracked in git and every failed recovery left no history.

**Permanent fix (this repo rebuild)**
1. **Plist `WorkingDirectory` points at `$REPO_ROOT`** (`~/Workspace/job-finder-agent`), NOT `~/Documents/Obsidian/`. This is the single most important change — it lets launchd chdir without hitting TCC.
2. **Relocate scripts outside the vault.** Runtime code moved from `~/Documents/Obsidian/work/job-search/` → `~/Workspace/job-finder-agent/bin/`. Now launchd can also exec the script path without TCC interference. Bonus: the repo is version-controlled, survives cross-machine drift, and recovery is `./bin/install.sh`.
3. **Drop logs out of the vault** into `$REPO_ROOT/.logs/` — no more TCC interference with log rotation, `ln -sfn`, or `find -delete`.
4. **Parameterize via `EnvironmentVariables`** in the plist: `OBSIDIAN_VAULT`, `REPO_ROOT`, `CLAUDE_BIN`, `PATH`. No more hardcoded `/Users/jaron/...` paths — same plist template renders cleanly on any machine via `bin/install.sh`.
5. **Hourly `health-check.sh` LaunchAgent** detects stale digests within an hour, attempts a self-heal via `launchctl kickstart`, and on failure writes `_HEALTH_ALERT.md` into the vault (which `/daily` refuses to bypass). Silent 24+ hour outages become loud 1-hour detections.
6. **If `/bin/bash` FDA gets reset by a macOS update**, the symptoms will be subtly different: launchd-chdir works (because `WorkingDirectory` is outside TCC), bash exec works (because the script path is outside TCC), but bash's own reads of vault files fail. Health-check catches this within an hour and the repair path is to re-add `/bin/bash` to System Settings → Privacy & Security → Full Disk Access. Document-and-monitor rather than eliminate-and-forget.

**Verification the fix stuck**
- `./bin/dry-run.sh` must pass from a launchd context (not just an interactive shell)
- `launchctl kickstart -k gui/$UID/com.jaron.job-search-daily` must produce a fresh digest header within minutes
- The next natural 8 AM run must update the digest without manual intervention

---

## 2026-04-11 (late update) — the REAL TCC fix

After the initial rebuild claimed success via raw SSH invocations, every `launchctl kickstart com.jaron.job-search-daily` still hung at startup with claude processes showing 0.01 CPU seconds over tens of minutes. Initially misdiagnosed as "orphan claude session contention" and "claude Code multi-instance lock." That was wrong.

**Actual root cause**: `/bin/bash` (and anything it spawns, including claude and node) lacked macOS Full Disk Access when launched by `launchd`. SSH-spawned bash inherits FDA from `sshd`'s security session — which is why raw SSH tests worked and why the install.sh dry-run passed. Launchd-spawned bash runs in a different TCC context without FDA, so:
- Reading `~/Documents/Obsidian/work/job-search/_intake.md` returned `Operation not permitted`
- Appending to `_daily-digest.md` returned `Operation not permitted`
- Creating new empty files (touch) and reading `~/Documents/Obsidian/.claude/agents/job-search-agent.md` happened to work — TCC is more granular than "all of ~/Documents is protected"
- `claude --print --agent` would start, then block silently on its first vault read, and appear as 0 CPU "stuck"

A minimal launchd probe plist (bash reading/writing four specific vault files, no claude involvement) reproduced the exact pattern: some reads blocked, some worked, appends to existing files always blocked.

**The one-time manual fix**: grant `/bin/bash` Full Disk Access in System Settings → Privacy & Security → Full Disk Access on the Mac Mini. **This cannot be scripted** — macOS blocks programmatic TCC modification since macOS 10.14. After the grant:
- Same probe plist: 4/4 ops succeeded
- Full `launchctl kickstart com.jaron.job-search-daily` completed cleanly in 15:07 (matching Apr 10 baseline)
- Digest header updated, wrapper footer written, exit code 0, no health alert
- Found 4 new Circle PM roles and advanced 6 pipeline rows to Networking with real 2nd-order connections

**Permanent operational implications**:
1. The `bin/install.sh` preflight includes a dry-run check, but that check passes under SSH — it does NOT prove the launchd path works. The ONLY way to verify is `launchctl kickstart -k gui/$UID/com.jaron.job-search-daily` followed by watching the run-daily.sh log for exit 0.
2. macOS updates sometimes reset FDA grants (rare — maybe once a year). When this happens, tomorrow's 8 AM run will hit the exact same pattern. Recovery: re-add /bin/bash in System Settings. The health-check canary will catch it within an hour and write `_HEALTH_ALERT.md`, and `/daily` will hard-block on it so the silent-failure-for-days pattern cannot recur.
3. Do not trust the SSH-based dry-run alone as proof of working runtime. The real test is the launchctl path.

---

## 2026-04-11 — Bonus findings surfaced during the rebuild

While fixing the TCC issue, three other latent bugs surfaced. All were masking each other.

### 1. Shadow cron job running in parallel

`crontab -l` on the Mac Mini showed two entries left over from a pre-LaunchAgent setup, firing the same agent at 08:00 daily and 08:05 Mondays:

```
0 8 * * * cd ~/Documents/Obsidian && ~/.local/bin/claude --print --agent job-search-agent "Run your daily workflow..." >> /tmp/job-search-agent.log 2>&1
5 8 * * 1 cd ~/Documents/Obsidian && ~/.local/bin/claude --print --agent job-search-agent "Run your weekly workflow..."
```

These cron entries did NOT share the LaunchAgent's `WorkingDirectory`/TCC problem — cron on this machine appears to have Full Disk Access. But the cron wrapper never calls `ulimit -n 10240`, so every cron run crashed with `Current limit: 256` after a few parallel web searches. Evidence in `/tmp/job-search-agent.log`:

```
error: An unknown error occurred, possibly due to low max file descriptors (Unexpected)
Current limit: 256
```

Meanwhile on the morning of Apr 11, the cron daily fired at 08:00 and spawned claude — but THIS one got stuck instead of crashing. It consumed 0.02 seconds of CPU in 6h55m and was still holding process slots when the investigation started. Zombie, not dead. Removed both crontab entries and killed the zombies. Lesson: **`crontab -l` is a required check whenever a scheduled job is misbehaving** — a LaunchAgent and a cron job for the same work can silently coexist for weeks.

### 2. Orphan `claude` processes silently block new `--agent` invocations

After the runtime rebuild, the first `launchctl kickstart` of the daily agent produced claude process PID 23321 which hung for 5+ minutes with 0.01 CPU seconds of activity — stuck, not working. A follow-up test isolated the cause:

- `claude --print "reply pong"` → 5 seconds, clean exit
- `claude --print --agent job-search-agent "Reply pong, do nothing else"` → 6 seconds, clean exit
- `claude --print --agent job-search-agent "Run your daily workflow..."` → hangs indefinitely (CPU ~0)
- Focused intake-drain prompt → completed cleanly in 2.5 minutes

At first glance this looked like a prompt-content bug (full workflow vs. narrow prompts). **Actual cause: two 5-day-old orphan `claude` processes** (PIDs 90471 and 97098) were running in forgotten zsh shells. They had been launched as interactive sessions days earlier and never quit. Once they were reaped (the earlier process cleanup during the TCC investigation killed their parent shells and they disappeared), the full daily-workflow prompt ran cleanly without any changes to the agent definition or the prompt.

**The contention mechanism is not fully understood.** Claude Code has per-user state in `~/.claude/` (projects, history.jsonl, session DB) and presumably a lock on some of it. The observation is: when >2 long-running `claude --print --agent` sibling processes exist, new invocations consume ~0 CPU for many minutes and appear to be waiting on something. Killing the oldest frees the new one. The tmux `claude --remote-control` background session (12 days old, used for Claude Cowork) does NOT trigger this — only `--print --agent` invocations that were launched from ordinary shells.

**Permanent guard**: `bin/run-daily.sh`, `bin/run-weekly.sh`, and `bin/health-check.sh` now each run a reaper at startup that `pkill -9`'s any `claude.*--print.*--agent job-search-agent` process older than 30 minutes. The pattern is narrow enough that it won't touch interactive sessions, `--remote-control` background tasks, or non-job-search agents. With this guard, even if a run hangs, the next scheduled run (8 AM daily OR health-check hourly) cleans up the stale process before starting — the hang cannot propagate across days.

**Investigation TODO (low priority now)**: trace which specific file lock or IPC socket the orphan `claude` processes are holding. Plausible candidates: `~/.claude/projects/<project-slug>/sessions.db`, a SQLite file with per-project write lock. Not blocking — the reaper handles it operationally.

### 3. Long-running orphan claude processes

`pgrep -af claude` revealed several long-running claude sessions on the Mac Mini:
- tmux session `claude --remote-control` (12 days)
- Interactive `claude` in a zsh session (5 days)
- Interactive `claude --continue` in another zsh session (5 days)

These are almost certainly Jaron's intentional background setups (Claude Cowork / OpenClaw per `~/.claude/CLAUDE.md`), not runaway processes. Leaving them alone. But it's possible they are contributing to the "full daily workflow hang" above by holding a shared session DB lock. Worth investigating when tracing the hang.

---

## 2026-04-07 through 2026-04-09 — 3-day outage (originally misdiagnosed)

**Symptom**
- Digest went stale for three consecutive mornings
- `launchctl list | grep job-search` appeared to return nothing at the time of investigation

**Original diagnosis (wrong)**
"Plists got unloaded — probably because `launchctl load` was session-scoped at some point and dropped on reboot." Fix applied Apr 10 was to reload them.

**Actual root cause (retroactively determined during the Apr 11 investigation)**
Same TCC issue as Apr 11. The plists likely were loaded the whole time and the `launchctl list` output was misread during a shell with different `$UID` context. Every 8 AM run in this window was silently dying with `Operation not permitted`. The Apr 10 "fix" only happened to work because Jaron ran the script manually over SSH around midnight after reloading the plists — that run inherited interactive FDA and succeeded, masking the fact that the 08:00 Apr 10 scheduled run also failed.

**Lesson**
When the digest is stale, always check `/tmp/job-search-agent-launchd.err` first. If it contains `Operation not permitted`, it is TCC — not a scheduling problem. Reloading the plist does nothing to fix TCC.
