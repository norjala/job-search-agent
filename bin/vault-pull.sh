#!/bin/bash
# Vault Pull — keep Mac Mini's vault git working tree in sync with GitHub.
#
# Triggered by com.jaron.vault-pull launchd job (or manually) every 30 min.
# Pulls CI commits (daily digest, intake, company folders) from
# github.com/norjala/obsidian into the local vault. Obsidian Sync then
# propagates the changes to MBP.
#
# Why this is safe to run from launchd (unlike the original agent jobs):
# - It's a 1-second operation, not a multi-hour Claude session.
# - It only reads + writes inside the vault dir; no claude binary involved.
# - `--rebase --autostash` handles the case where local has uncommitted
#   Obsidian-Sync changes — they get re-applied on top of the pull.
# - If a conflict happens, the pull aborts cleanly and the next tick retries.

set -u

VAULT_DIR="${VAULT_DIR:-$HOME/Documents/Obsidian}"
LOG_DIR="${LOG_DIR:-$HOME/Workspace/job-finder-agent/.logs}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/vault-pull.log"

# Trim log file if it gets large.
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ]; then
  tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

if [ ! -d "$VAULT_DIR/.git" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') vault-pull: $VAULT_DIR is not a git working tree; skipping" >> "$LOG"
  exit 0
fi

cd "$VAULT_DIR" || { echo "$(date '+%Y-%m-%d %H:%M:%S') vault-pull: cd to vault failed" >> "$LOG"; exit 1; }

# Quick connectivity check — don't spam logs if offline.
if ! git ls-remote --heads origin >/dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') vault-pull: cannot reach origin; skipping" >> "$LOG"
  exit 0
fi

# --rebase keeps history linear; --autostash safely shelves any local mods
# (typically Obsidian-Sync deltas) and re-applies after the pull.
if output=$(git pull --rebase --autostash 2>&1); then
  if echo "$output" | grep -q "Already up to date"; then
    : # silent on no-op
  else
    {
      echo "$(date '+%Y-%m-%d %H:%M:%S') vault-pull: pulled new commits"
      echo "$output" | sed 's/^/  /'
    } >> "$LOG"
  fi
else
  {
    echo "$(date '+%Y-%m-%d %H:%M:%S') vault-pull: FAILED"
    echo "$output" | sed 's/^/  /'
  } >> "$LOG"
  exit 1
fi
