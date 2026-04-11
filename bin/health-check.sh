#!/bin/bash
# Job Search Agent — Health Check (Self-Healing Canary)
#
# Invoked hourly by com.jaron.job-search-health LaunchAgent.
#
# Logic:
#   1. Read _daily-digest.md header for last-run timestamp
#   2. If the last successful run is < 26 hours old → healthy, clear any alert
#   3. If stale → attempt self-heal via `launchctl kickstart` on the daily agent
#   4. Wait, re-check. If still stale, write _HEALTH_ALERT.md into the vault
#      (which /daily hard-blocks on) and leave it there until the next
#      successful run clears it.
#
# This is designed so that transient TCC glitches or a single missed run
# self-recover silently, but persistent failures become loud immediately
# instead of silently costing Jaron days of job-search momentum.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian}"
JOB_SEARCH_DIR="$OBSIDIAN_VAULT/work/job-search"
DIGEST_FILE="$JOB_SEARCH_DIR/_daily-digest.md"
ALERT_FILE="$JOB_SEARCH_DIR/_HEALTH_ALERT.md"
STALE_THRESHOLD_HOURS=26

HC_LOG_DIR="$REPO_ROOT/.logs"
mkdir -p "$HC_LOG_DIR"
HC_LOG="$HC_LOG_DIR/health-check.log"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$HC_LOG"; }

log "--- health-check start ---"

# --- Helper: compute age in hours of last successful run ------------------
# The digest's header line looks like:
#   _Last run: 2026-04-10 09:00 — 5 new roles, ..._
# We extract the timestamp and diff against now.
compute_age_hours() {
  local header_line last_run last_run_epoch now_epoch
  if [ ! -r "$DIGEST_FILE" ]; then
    log "ERROR: cannot read $DIGEST_FILE — likely TCC blocking /bin/bash."
    echo -1
    return
  fi
  header_line="$(head -5 "$DIGEST_FILE" | grep -m1 '^_Last run:')"
  last_run="$(echo "$header_line" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}' | head -1)"
  if [ -z "$last_run" ]; then
    log "WARN: could not parse Last run timestamp from digest header: '$header_line'"
    echo -1
    return
  fi
  last_run_epoch="$(date -j -f "%Y-%m-%d %H:%M" "$last_run" "+%s" 2>/dev/null)"
  if [ -z "$last_run_epoch" ]; then
    log "WARN: could not convert last_run='$last_run' to epoch"
    echo -1
    return
  fi
  now_epoch="$(date "+%s")"
  echo $(( (now_epoch - last_run_epoch) / 3600 ))
}

AGE="$(compute_age_hours)"
log "digest age: ${AGE}h"

# --- Healthy path ----------------------------------------------------------
if [ "$AGE" -ge 0 ] && [ "$AGE" -lt "$STALE_THRESHOLD_HOURS" ]; then
  if [ -f "$ALERT_FILE" ]; then
    rm -f "$ALERT_FILE"
    log "cleared stale $ALERT_FILE (agent recovered)"
  fi
  log "healthy"
  exit 0
fi

# --- Stale: attempt self-heal ---------------------------------------------
if [ "$AGE" -lt 0 ]; then
  log "cannot determine digest age — treating as stale for alerting purposes"
fi

log "digest stale (>${STALE_THRESHOLD_HOURS}h) — attempting self-heal via launchctl kickstart"
if launchctl kickstart -k "gui/$UID/com.jaron.job-search-daily" >> "$HC_LOG" 2>&1; then
  log "kickstart dispatched"
else
  log "kickstart failed (rc=$?) — daily agent may not be loaded"
fi

# Give the daily run some time to produce output. The agent typically
# finishes in under 10 minutes but we cap the wait so health-check itself
# stays fast.
sleep 180

AGE_AFTER="$(compute_age_hours)"
log "post-heal digest age: ${AGE_AFTER}h"

if [ "$AGE_AFTER" -ge 0 ] && [ "$AGE_AFTER" -lt "$STALE_THRESHOLD_HOURS" ]; then
  rm -f "$ALERT_FILE"
  log "self-heal succeeded"
  exit 0
fi

# --- Self-heal failed: write alert ----------------------------------------
log "self-heal FAILED — writing $ALERT_FILE"

LAUNCHD_ERR_TAIL=""
if [ -r /tmp/job-search-agent-launchd.err ]; then
  LAUNCHD_ERR_TAIL="$(tail -20 /tmp/job-search-agent-launchd.err)"
fi

LATEST_LOG_TAIL=""
if [ -r "$HC_LOG_DIR/latest.log" ]; then
  LATEST_LOG_TAIL="$(tail -20 "$HC_LOG_DIR/latest.log")"
fi

cat > "$ALERT_FILE" <<EOF
# ⚠️ Job Search Agent — STALE

**Detected:** $(date '+%Y-%m-%d %H:%M:%S %Z')
**Digest age:** ${AGE}h (stale threshold: ${STALE_THRESHOLD_HOURS}h)
**Self-heal attempt:** FAILED (kickstart did not produce a fresh run within 3 minutes)
**Host:** $(hostname)

## Repair

\`\`\`bash
cd $REPO_ROOT
./bin/install.sh --repair
\`\`\`

If that fails, check the common causes in priority order:

1. **TCC blocked /bin/bash** — grant Full Disk Access in System Settings → Privacy & Security → Full Disk Access → + → ⌘⇧. → /bin/bash
2. **claude binary missing or moved** — \`command -v claude\`
3. **Plists unloaded** — \`launchctl list | grep job-search\`
4. **Vault path changed** — confirm \`$OBSIDIAN_VAULT\` exists

## /tmp/job-search-agent-launchd.err (tail)

\`\`\`
$LAUNCHD_ERR_TAIL
\`\`\`

## Latest run log (tail)

\`\`\`
$LATEST_LOG_TAIL
\`\`\`

---
_This file is written automatically by \`bin/health-check.sh\` and is cleared on the next successful run. \`/daily\` hard-blocks while it exists._
EOF

log "alert written to $ALERT_FILE"
log "--- health-check end ---"
exit 1
