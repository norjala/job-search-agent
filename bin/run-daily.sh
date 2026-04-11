#!/bin/bash
# Job Search Agent — Daily Runner
# Invoked by com.jaron.job-search-daily LaunchAgent at 8:00 AM, or manually.
#
# This file lives OUTSIDE the vault (which is TCC-protected) so that launchd
# can exec it. It still reads/writes the vault at runtime — for that to work
# under launchd, /bin/bash must be granted Full Disk Access in System Settings
# (see docs/scheduling-setup.md).
#
# Environment variables the plist / caller may set:
#   OBSIDIAN_VAULT   — path to the vault (default: $HOME/Documents/Obsidian)
#   REPO_ROOT        — path to this repo (default: computed from $0)
#   CLAUDE_BIN       — path to the claude CLI (default: auto-detected)
#   INTAKE_FILE      — override intake path (used by dry-run.sh)

set -u

# --- Resolve paths ---------------------------------------------------------
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian}"
JOB_SEARCH_DIR="$OBSIDIAN_VAULT/work/job-search"
DIGEST_FILE="${DIGEST_FILE:-$JOB_SEARCH_DIR/_daily-digest.md}"

# Auto-detect claude binary — try PATH, then common install locations.
if [ -z "${CLAUDE_BIN:-}" ]; then
  if command -v claude &>/dev/null; then
    CLAUDE_BIN="$(command -v claude)"
  elif [ -x "$HOME/.local/bin/claude" ]; then
    CLAUDE_BIN="$HOME/.local/bin/claude"
  elif [ -x "/opt/homebrew/bin/claude" ]; then
    CLAUDE_BIN="/opt/homebrew/bin/claude"
  else
    echo "ERROR: claude binary not found. Set CLAUDE_BIN or install claude-code." >&2
    exit 127
  fi
fi

# --- Resource limits -------------------------------------------------------
# macOS default per-process FD limit is 256. Claude Code agents that fan out
# to parallel web searches + many file ops blow through that. Raise to 10240.
# `|| true` so the script keeps running if the shell can't raise the limit.
ulimit -n 10240 || true

# --- Per-run logging -------------------------------------------------------
# Logs live in the REPO (outside the vault / outside TCC zone) so rotation
# and access are never blocked by macOS permissions.
LOG_DIR="$REPO_ROOT/.logs"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
LOG="$LOG_DIR/daily-$STAMP.log"
ln -sfn "$LOG" "$LOG_DIR/latest.log"

# 30-day log retention.
find "$LOG_DIR" -name '*.log' -type f -mtime +30 -delete 2>/dev/null || true

# --- Reap stale job-search-agent claude processes --------------------------
# If a previous run hung (e.g. due to Claude Code multi-instance session-state
# contention — observed on 2026-04-11 with orphaned 5-day-old claude sessions
# silently blocking new invocations), its claude child may still be alive.
# Any such process older than 30 minutes is almost certainly stuck and will
# block this run the same way. Kill it before we start.
#
# We match on "--agent job-search-agent" which is unique enough to avoid
# killing unrelated claude sessions (interactive shells, Claude Cowork, etc.).
REAPED_COUNT=0
while IFS= read -r stale_pid; do
  [ -z "$stale_pid" ] && continue
  # macOS ps etimes returns elapsed seconds
  age_s=$(ps -p "$stale_pid" -o etimes= 2>/dev/null | tr -d ' ')
  if [ -n "$age_s" ] && [ "$age_s" -gt 1800 ]; then
    if kill -9 "$stale_pid" 2>/dev/null; then
      REAPED_COUNT=$((REAPED_COUNT + 1))
      echo "Reaped stale claude PID $stale_pid (age ${age_s}s)" >> "$LOG_DIR/run-daily-reaper.log"
    fi
  fi
done < <(pgrep -f "claude.*--print.*--agent job-search-agent" 2>/dev/null || true)

# --- Run -------------------------------------------------------------------
{
  echo "=== Job Search Agent Daily Run: $(date) ==="
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
    "Run your daily workflow as described in your agent instructions. Today is $(date +%Y-%m-%d). Execute all daily steps: Role Scanner, Process Intake, Auto-Advance Pipeline, Follow-up Reminders, Generate Daily Digest. Only surface genuinely new roles in the digest." \
    >> "$LOG" 2>&1
  EXIT=$?
fi

{
  echo "---"
  echo "=== Finished: $(date) — exit=$EXIT ==="
} >> "$LOG"

# --- Heartbeat: always-write digest footer (survives agent crashes) -------
# Even if the agent never reached 'Generate Daily Digest', this footer makes
# the run visible in _daily-digest.md. A glance at the last line of the digest
# tells you whether anything ran, when, and whether it succeeded.
STATUS=$( [ "$EXIT" -eq 0 ] && echo "ok" || echo "FAIL(exit=$EXIT)" )
printf '\n\n---\n_Run wrapper: daily finished at %s — status: %s — log: %s_\n' \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$STATUS" "$LOG" \
  >> "$DIGEST_FILE" 2>/dev/null || true

exit $EXIT
