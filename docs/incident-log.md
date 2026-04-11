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
Both the script path (`~/Documents/Obsidian/work/job-search/run-job-search-agent.sh`) and the plist's `WorkingDirectory` (`~/Documents/Obsidian`) live inside macOS's TCC-protected zone. launchd-spawned processes do NOT inherit interactive-shell Full Disk Access grants — they run in a separate TCC sandbox. When launchd tries to chdir into the vault and exec a script that's also in the vault, both operations are blocked with `Operation not permitted` before the script ever runs. Exit code 126 is macOS's "could not execute file" signal.

The "Apr 7–9 plist unloaded" theory from the prior incident was wrong. Re-inspection showed the plists were loaded the entire time; every scheduled 8 AM run for at least five days had been silently failing with TCC errors. The Apr 10 `_daily-digest.md` "success" was a manual run Jaron triggered at 00:19 AM over SSH, which inherits sshd's FDA grant and therefore bypassed TCC entirely.

**Why it kept recurring**
1. Symptoms only appeared when looking at the digest header 12+ hours after the failed 8 AM run. Detection was manual, delayed, and easy to miss.
2. Manual recovery ran from an interactive SSH shell, which masked the TCC problem — making the scheduled-run bug look like a transient "launchd hiccup."
3. The vault's own setup doc flagged TCC as "the silent killer" in writing but the fix was never actually applied.
4. Scripts lived in the Obsidian vault, so they couldn't be tracked in git and every failed recovery left no history.

**Permanent fix (this repo rebuild)**
1. **Relocate scripts outside the vault.** Runtime code moved from `~/Documents/Obsidian/work/job-search/` → `~/Workspace/job-finder-agent/bin/`. The repo is version-controlled, survives cross-machine drift, and recovery is `./bin/install.sh`.
2. **Grant `/bin/bash` Full Disk Access** in System Settings → Privacy & Security. This is a one-time manual step (per-machine) that allows launchd-spawned bash to read the vault. Without this grant, even a script living outside the vault can't read `_intake.md` or the agent definition.
3. **Drop logs out of the vault** into `$REPO_ROOT/.logs/` — no more TCC interference with log rotation.
4. **Plist `WorkingDirectory` points at `$REPO_ROOT`**, not `~/Documents/Obsidian/`, so launchd's initial chdir doesn't hit TCC.
5. **Hourly `health-check.sh` LaunchAgent** detects stale digests within an hour, attempts a self-heal via `launchctl kickstart`, and on failure writes `_HEALTH_ALERT.md` into the vault (which `/daily` refuses to bypass). Silent 24+ hour outages become loud 1-hour detections.

**Verification the fix stuck**
- `./bin/dry-run.sh` must pass from a launchd context (not just an interactive shell)
- `launchctl kickstart -k gui/$UID/com.jaron.job-search-daily` must produce a fresh digest header within minutes
- The next natural 8 AM run must update the digest without manual intervention

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
