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

while IFS= read -r stale_pid; do
  [ -z "$stale_pid" ] && continue
  etime_raw=$(ps -p "$stale_pid" -o etime= 2>/dev/null | tr -d ' ')
  [ -z "$etime_raw" ] && continue
  age_s=$(parse_etime_to_seconds "$etime_raw")
  if [ "$age_s" -gt 1800 ] 2>/dev/null; then
    kill -9 "$stale_pid" 2>/dev/null && echo "$(date '+%Y-%m-%d %H:%M:%S') Reaped stale claude PID $stale_pid (age ${age_s}s)" >> "$LOG_DIR/run-weekly-reaper.log"
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

# Keep cwd at $HOME (non-TCC). See run-daily.sh for the full explanation of
# why we must NOT cd into the vault before invoking claude.
cd "$HOME" 2>> "$LOG"

if [ "${EXIT:-0}" -eq 0 ]; then
  "$CLAUDE_BIN" \
    --print \
    --agent job-search-agent \
    "Your vault root (working directory for all paths in the agent instructions) is: $OBSIDIAN_VAULT
Change into that directory first before doing any work. All relative paths in your agent definition (e.g. work/job-search/, companies/, etc.) are relative to that vault root.

Run your weekly workflow as described in your agent instructions. Today is $(date +%Y-%m-%d). Execute ALL steps: Daily Run Workflow (Role Scanner, Process Intake, Auto-Advance Pipeline, Follow-up Reminders, Generate Daily Digest) AND Weekly Run Workflow (Broad Discovery Search, Research Refresh for Rank 1 companies). Only surface genuinely new roles in the digest." \
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
