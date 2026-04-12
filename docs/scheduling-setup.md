# Scheduling Setup

This doc covers the runtime scheduling layer — how the daily, weekly, and hourly health-check agents get loaded, how to verify they're healthy, and how to recover from failures.

## What's running

Three macOS LaunchAgents run the job-search-agent automatically:

| Schedule | Label | Script | Purpose |
|----------|-------|--------|---------|
| Daily at 8:00 AM | `com.jaron.job-search-daily` | `bin/run-daily.sh` | Role Scanner, intake, pipeline, digest |
| Monday at 8:00 AM | `com.jaron.job-search-weekly` | `bin/run-weekly.sh` | Daily + broad discovery + research refresh |
| Every hour | `com.jaron.job-search-health` | `bin/health-check.sh` | Canary: detects stale digest, self-heals, escalates |

**Plists:** `~/Library/LaunchAgents/com.jaron.job-search-{daily,weekly,health}.plist` (rendered from the templates in this repo's `launchd/` directory by `bin/install.sh`)

**Shell scripts:** `~/Workspace/job-finder-agent/bin/` — source of truth, version-controlled in git

**Logs:**
- Per-run: `$REPO_ROOT/.logs/daily-YYYY-MM-DD_HHMMSS.log` (30-day retention)
- Latest symlink: `$REPO_ROOT/.logs/latest.log`
- Health-check: `$REPO_ROOT/.logs/health-check.log`
- launchd-level (script-never-started errors): `/tmp/job-search-agent-launchd.{log,err}`

## Install / reinstall

```bash
cd ~/Workspace/job-finder-agent
git pull
./bin/install.sh
```

The installer is idempotent. It boots out any existing `com.jaron.job-search-*` or legacy `com.job-search-agent.*` LaunchAgents, re-renders the plists with current paths, re-bootstraps them, and runs `./bin/dry-run.sh` as a smoke test.

Use `./bin/install.sh --repair` from the `/daily` hard-block recovery path — same effect, but skips the smoke test so the `/daily` session can continue immediately.

## ⚠️ MANDATORY one-time manual step — grant `/bin/bash` Full Disk Access

**Without this, NOTHING runs** — launchd-spawned bash can't read `_intake.md`, can't append the digest footer, and claude will hang silently on its first vault read. This is not optional; the runtime cannot work without it.

macOS TCC sandboxes launchd's security session separately from interactive shells. SSH-spawned bash inherits Full Disk Access from sshd, so SSH tests will *lie to you* — they'll pass even when the scheduled runs would fail. **Always verify with `launchctl kickstart`**, never with a manual bash invocation.

### Steps (physical GUI access to the machine required — cannot be done via SSH)

1. **System Settings → Privacy & Security → Full Disk Access**
2. Click the **+** button (unlock with password if prompted)
3. Press **⌘⇧G** to open "Go to Folder"
4. Type `/bin` and press Enter
5. Select **`bash`** and click **Open**
6. Confirm the toggle is **ON**

Optional but recommended for defense-in-depth: also add `/opt/homebrew/bin/node` (claude's runtime).

### Verify

```bash
# Should complete in ~15 minutes with exit 0 and update the digest mtime
launchctl kickstart -k gui/$UID/com.jaron.job-search-daily
tail -f ~/Workspace/job-finder-agent/.logs/latest.log
```

If you see `Operation not permitted` in the log or the claude child has ~0 CPU after a minute, FDA is not in effect.

### If macOS resets the grant (rare, ~annual)

Symptoms: scheduled run hangs/fails silently, `_HEALTH_ALERT.md` appears in vault within 1-26 hours, `/daily` hard-blocks.

Fix: re-add `/bin/bash` to Full Disk Access using the same steps above.

## Daily health check (60 seconds)

1. `head -3 ~/Documents/Obsidian/work/job-search/_daily-digest.md` — the first `_Last run:_` line should be from this morning.
2. `tail -3` on the same file — the wrapper footer should say `status: ok`.
3. If both timestamps are fresh and `status: ok`, the run was clean.
4. If only the footer is fresh but the agent header isn't, the wrapper ran but the agent itself crashed — check `$REPO_ROOT/.logs/latest.log`.
5. If neither is present and the digest is stale, check `_HEALTH_ALERT.md` in the vault.

## Diagnostic commands

```bash
# Are all three agents loaded?
launchctl list | grep job-search

# What's the next run time for daily?
launchctl print gui/$UID/com.jaron.job-search-daily 2>&1 | grep -E "(state|next_run|last exit)"

# Tail the latest run log
tail -f ~/Workspace/job-finder-agent/.logs/latest.log

# Launchd-level errors (TCC, script-not-found, exec-failed)
cat /tmp/job-search-agent-launchd.err

# Health-check history
tail -30 ~/Workspace/job-finder-agent/.logs/health-check.log
```

## Manual runs

```bash
# Trigger the scheduled daily run immediately
launchctl kickstart -k gui/$UID/com.jaron.job-search-daily

# Or run the script directly (inherits your interactive shell's TCC — useful
# as a sanity check that separates "script logic" from "launchd permissions")
bash ~/Workspace/job-finder-agent/bin/run-daily.sh
```

## Stop / restart

```bash
# Stop everything (keeps plists on disk, just unloads)
launchctl bootout gui/$UID/com.jaron.job-search-daily
launchctl bootout gui/$UID/com.jaron.job-search-weekly
launchctl bootout gui/$UID/com.jaron.job-search-health

# Restart
./bin/install.sh --repair

# Full uninstall (removes plists too)
./bin/uninstall.sh
```

Editing the shell scripts does NOT require a reload — the plists just call the script and the next scheduled run picks up the changes. Editing a plist template in `launchd/` requires re-running `./bin/install.sh`.

## Why LaunchAgent and not `CronCreate` / `schedule`

Claude Code's built-in cron/trigger system was evaluated and rejected because:
- Session-bound (the task dies when the parent Claude Code session exits)
- 7-day auto-expiry on recurring tasks
- Runs inside Claude Code's TCC context, which we'd still have to debug

macOS LaunchAgents are OS-level, survive reboots, have no expiry, and have a clear permissions model. True set-and-forget — once the FDA grant is in place.

## Failure modes (priority order)

See `docs/incident-log.md` for the full history. The short list:

1. **TCC blocked `/bin/bash`** — `/tmp/job-search-agent-launchd.err` contains `Operation not permitted`. Fix: add `/bin/bash` to Full Disk Access. This has been the root cause of every silent failure to date.
2. **Plists got unloaded** — `launchctl list | grep job-search` returns empty. Fix: `./bin/install.sh --repair`.
3. **claude binary moved** — `launchd.err` contains `command not found` or `No such file or directory`. Fix: reinstall claude-code or `./bin/install.sh` (which re-auto-detects).
4. **Mac Mini asleep through 8 AM** — `pmset -g log | grep Sleep` shows sleep across 08:00. Fix: `pmset` caffeinate config, or accept that one run is missed and wait for health-check to recover.
5. **Vault path changed** — installer errors "vault not found." Fix: `OBSIDIAN_VAULT=/path ./bin/install.sh`.
6. **FD limit** — script's `ulimit -n 10240` fails in a particular shell context. Fix: raise the default with `launchctl limit` or change the plist.
