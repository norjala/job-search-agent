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

# --- Helper: compute age in hours of the digest file ----------------------
# We use the file's mtime rather than parsing the "_Last run:_" header
# because the agent has been observed to hallucinate that timestamp
# (writing future times, wrong timezones, etc). mtime is filesystem truth:
# any successful run bumps it, either via the agent's own digest write or
# via the wrapper footer append in run-daily.sh.
compute_age_hours() {
  if [ ! -e "$DIGEST_FILE" ]; then
    log "ERROR: $DIGEST_FILE does not exist"
    echo 999
    return
  fi
  local mtime now
  mtime=$(stat -f %m "$DIGEST_FILE" 2>/dev/null)
  if [ -z "$mtime" ]; then
    log "ERROR: stat failed on $DIGEST_FILE — possibly TCC or missing file"
    echo 999
    return
  fi
  now=$(date +%s)
  echo $(( (now - mtime) / 3600 ))
}

# --- Helper: is a daily/weekly agent run currently in progress? -----------
# Returns 0 (true) if yes. We treat any claude --print --agent job-search-agent
# process as "a run in progress" — whether fresh or stuck. The reaper inside
# run-daily.sh handles the stuck case, so health-check only cares whether
# *something* is making progress.
is_run_in_progress() {
  pgrep -f "claude.*--print.*--agent job-search-agent" >/dev/null 2>&1
}

AGE="$(compute_age_hours)"
log "digest mtime age: ${AGE}h"

# --- Healthy path ----------------------------------------------------------
if [ "$AGE" -lt "$STALE_THRESHOLD_HOURS" ]; then
  if [ -f "$ALERT_FILE" ]; then
    rm -f "$ALERT_FILE"
    log "cleared stale $ALERT_FILE (digest recovered)"
  fi
  log "healthy"
  exit 0
fi

# --- In-progress path: a run is running, give it time ---------------------
if is_run_in_progress; then
  log "digest stale (${AGE}h) but a claude run is in progress — waiting, not alerting"
  exit 0
fi

log "digest stale (>${STALE_THRESHOLD_HOURS}h) and no run in progress — attempting self-heal"

# Reap stale job-search-agent claude processes before kickstart, otherwise
# the new run will hang behind the same lock the stale ones are holding.
# macOS `ps -o etime=` format: [[DD-]HH:]MM:SS — parse in portable bash.
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

REAPED=0
while IFS= read -r stale_pid; do
  [ -z "$stale_pid" ] && continue
  etime_raw=$(ps -p "$stale_pid" -o etime= 2>/dev/null | tr -d ' ')
  [ -z "$etime_raw" ] && continue
  age_s=$(parse_etime_to_seconds "$etime_raw")
  if [ "$age_s" -gt 1800 ] 2>/dev/null; then
    if kill -9 "$stale_pid" 2>/dev/null; then
      REAPED=$((REAPED + 1))
      log "reaped stale claude PID $stale_pid (age ${age_s}s)"
    fi
  fi
done < <(pgrep -f "claude.*--print.*--agent job-search-agent" 2>/dev/null || true)
log "reaper killed $REAPED stale claude process(es)"

if launchctl kickstart -k "gui/$UID/com.jaron.job-search-daily" >> "$HC_LOG" 2>&1; then
  log "kickstart dispatched"
else
  log "kickstart failed (rc=$?) — daily agent may not be loaded"
fi

# Record the kickstart attempt. The next hourly health-check will use this
# to decide whether recovery is "in progress" (give it time) vs "attempted
# and failed" (write alert). A full daily run takes ~15 minutes, plus slack.
KICKSTART_MARKER="$HC_LOG_DIR/.last-kickstart"
date +%s > "$KICKSTART_MARKER"

# Brief pause (not a full run wait) to let the new process spawn. If it
# does, we'll detect it as "in progress" and exit without alert. If it
# can't spawn at all (e.g. plist broken), we'll proceed to the alert path.
sleep 20

if is_run_in_progress; then
  log "self-heal dispatched — a daily run is now in progress, will verify on next hourly check"
  exit 0
fi

# --- Kickstart fired but no process is running — write alert --------------
log "kickstart dispatched but no claude process detected after 20s — writing $ALERT_FILE"

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
**Digest mtime age:** ${AGE}h (stale threshold: ${STALE_THRESHOLD_HOURS}h)
**Self-heal attempt:** FAILED (kickstart dispatched but no claude process spawned within 20s — plist may be broken or launchd refused the job)
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
