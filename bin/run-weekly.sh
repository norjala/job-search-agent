#!/bin/bash
# Job Search Agent — Weekly Runner (Mondays)
# Invoked by com.jaron.job-search-weekly LaunchAgent at 8:00 AM Monday.
# See bin/run-daily.sh for environment variable docs.

set -u

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian}"
JOB_SEARCH_DIR="$OBSIDIAN_VAULT/work/job-search"
DIGEST_FILE="${DIGEST_FILE:-$JOB_SEARCH_DIR/_daily-digest.md}"

if [ -z "${CLAUDE_BIN:-}" ]; then
  if command -v claude &>/dev/null; then
    CLAUDE_BIN="$(command -v claude)"
  elif [ -x "$HOME/.local/bin/claude" ]; then
    CLAUDE_BIN="$HOME/.local/bin/claude"
  elif [ -x "/opt/homebrew/bin/claude" ]; then
    CLAUDE_BIN="/opt/homebrew/bin/claude"
  else
    echo "ERROR: claude binary not found." >&2
    exit 127
  fi
fi

ulimit -n 10240 || true

LOG_DIR="$REPO_ROOT/.logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
LOG="$LOG_DIR/weekly-$STAMP.log"
ln -sfn "$LOG" "$LOG_DIR/latest.log"

find "$LOG_DIR" -name '*.log' -type f -mtime +30 -delete 2>/dev/null || true

# Reap stale job-search-agent claude processes (see run-daily.sh for rationale).
while IFS= read -r stale_pid; do
  [ -z "$stale_pid" ] && continue
  age_s=$(ps -p "$stale_pid" -o etimes= 2>/dev/null | tr -d ' ')
  if [ -n "$age_s" ] && [ "$age_s" -gt 1800 ]; then
    kill -9 "$stale_pid" 2>/dev/null && echo "Reaped stale claude PID $stale_pid (age ${age_s}s)" >> "$LOG_DIR/run-weekly-reaper.log"
  fi
done < <(pgrep -f "claude.*--print.*--agent job-search-agent" 2>/dev/null || true)

{
  echo "=== Job Search Agent WEEKLY Run: $(date) ==="
  echo "User: $(whoami)"
  echo "Host: $(hostname)"
  echo "FD limit: $(ulimit -n)"
  echo "Vault: $OBSIDIAN_VAULT"
  echo "Repo:  $REPO_ROOT"
  echo "Claude: $CLAUDE_BIN"
  echo "Log:   $LOG"
  echo "---"
} >> "$LOG"

cd "$OBSIDIAN_VAULT" 2>> "$LOG" || {
  echo "FATAL: cannot cd to $OBSIDIAN_VAULT — likely TCC blocking /bin/bash." >> "$LOG"
  echo "Fix: grant /bin/bash Full Disk Access in System Settings → Privacy & Security." >> "$LOG"
  EXIT=126
}

if [ "${EXIT:-0}" -eq 0 ]; then
  "$CLAUDE_BIN" \
    --print \
    --agent job-search-agent \
    "Run your weekly workflow as described in your agent instructions. Today is $(date +%Y-%m-%d). Execute ALL steps: Daily Run Workflow (Role Scanner, Process Intake, Auto-Advance Pipeline, Follow-up Reminders, Generate Daily Digest) AND Weekly Run Workflow (Broad Discovery Search, Research Refresh for Rank 1 companies). Only surface genuinely new roles in the digest." \
    >> "$LOG" 2>&1
  EXIT=$?
fi

{
  echo "---"
  echo "=== Finished: $(date) — exit=$EXIT ==="
} >> "$LOG"

STATUS=$( [ "$EXIT" -eq 0 ] && echo "ok" || echo "FAIL(exit=$EXIT)" )
printf '\n\n---\n_Run wrapper: weekly finished at %s — status: %s — log: %s_\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$STATUS" "$LOG" \
  >> "$DIGEST_FILE" 2>/dev/null || true

exit $EXIT
