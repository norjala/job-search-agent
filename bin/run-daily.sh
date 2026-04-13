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
# If a previous run hung, its claude child may still be alive. Any such
# process older than 30 minutes is almost certainly stuck and will block
# this run behind whatever shared lock it's holding. Kill it before we start.
#
# We match on "--agent job-search-agent" which is narrow enough to leave
# interactive claude sessions, Claude Cowork (--remote-control), and
# unrelated agents untouched.
#
# macOS `ps -o etime=` outputs [[DD-]HH:]MM:SS. Portable bash parser below.
# (Linux supports `etimes` in seconds, macOS does not — so we parse etime.)
parse_etime_to_seconds() {
  local etime="$1"
  local days=0
  if [[ "$etime" == *-* ]]; then
    days="${etime%%-*}"
    etime="${etime#*-}"
  fi
  local a b c h=0 m=0 s=0
  IFS=: read -r a b c <<< "$etime"
  if [ -n "$c" ]; then
    h="$a"; m="$b"; s="$c"
  elif [ -n "$b" ]; then
    h=0; m="$a"; s="$b"
  else
    h=0; m=0; s="${a:-0}"
  fi
  # Strip any leading zeros to avoid octal interpretation
  h=$((10#${h:-0})); m=$((10#${m:-0})); s=$((10#${s:-0})); days=$((10#${days:-0}))
  echo $((days * 86400 + h * 3600 + m * 60 + s))
}

REAPED_COUNT=0
while IFS= read -r stale_pid; do
  [ -z "$stale_pid" ] && continue
  etime_raw=$(ps -p "$stale_pid" -o etime= 2>/dev/null | tr -d ' ')
  [ -z "$etime_raw" ] && continue
  age_s=$(parse_etime_to_seconds "$etime_raw")
  if [ "$age_s" -gt 1800 ] 2>/dev/null; then
    if kill -9 "$stale_pid" 2>/dev/null; then
      REAPED_COUNT=$((REAPED_COUNT + 1))
      echo "$(date '+%Y-%m-%d %H:%M:%S') Reaped stale claude PID $stale_pid (age ${age_s}s)" >> "$LOG_DIR/run-daily-reaper.log"
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

# CRITICAL: Do NOT cd into the vault. Claude's startup calls getcwd(), and if
# cwd is inside ~/Documents/ (TCC-protected), the getcwd() blocks indefinitely
# when the claude binary lacks Full Disk Access. /bin/bash has FDA (manually
# granted), but claude's binary is separate AND auto-updates to a new path on
# every version bump, invalidating any per-binary FDA grant.
#
# Instead, keep cwd at $HOME (non-TCC) and tell the agent the vault path in the
# prompt. Claude's tool calls (Read, Write, Bash) go through /bin/bash which
# HAS FDA, so vault file access works transparently. Only claude's own startup
# getcwd() is the problem, and we solve it by not being in a TCC directory.
cd "$HOME" 2>> "$LOG"

if [ "${EXIT:-0}" -eq 0 ]; then
  "$CLAUDE_BIN" \
    --print \
    --agent job-search-agent \
    "Your vault root (working directory for all paths in the agent instructions) is: $OBSIDIAN_VAULT
Change into that directory first before doing any work. All relative paths in your agent definition (e.g. work/job-search/, companies/, etc.) are relative to that vault root.

Run your daily workflow as described in your agent instructions. Today is $(date +%Y-%m-%d). Execute all daily steps: Role Scanner, Process Intake, Auto-Advance Pipeline, Follow-up Reminders, Generate Daily Digest. Only surface genuinely new roles in the digest." \
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
