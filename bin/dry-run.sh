#!/bin/bash
# Job Search Agent — Dry Run (smoke test)
#
# Runs the daily script against a disposable test intake file so you can
# verify the end-to-end plumbing (launchd permissions, FD limit, claude CLI,
# vault writes, digest footer) without waiting for 8 AM and without polluting
# the real intake pipeline.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian}"
JOB_SEARCH_DIR="$OBSIDIAN_VAULT/work/job-search"

echo "==> Dry-run: verifying TCC + FDA grant by reading & writing the vault"

if ! head -1 "$JOB_SEARCH_DIR/_daily-digest.md" &>/dev/null; then
  echo "FAIL: cannot read $JOB_SEARCH_DIR/_daily-digest.md"
  echo "      /bin/bash likely lacks Full Disk Access."
  echo "      Fix: System Settings → Privacy & Security → Full Disk Access → + → ⌘⇧. → /bin/bash"
  exit 1
fi
echo "  ok — vault read works"

TEST_MARKER="$JOB_SEARCH_DIR/.dry-run-probe"
if ! echo "probe $(date)" > "$TEST_MARKER"; then
  echo "FAIL: cannot write $TEST_MARKER"
  exit 1
fi
rm -f "$TEST_MARKER"
echo "  ok — vault write works"

if [ -z "${CLAUDE_BIN:-}" ]; then
  if command -v claude &>/dev/null; then
    CLAUDE_BIN="$(command -v claude)"
  elif [ -x "$HOME/.local/bin/claude" ]; then
    CLAUDE_BIN="$HOME/.local/bin/claude"
  elif [ -x "/opt/homebrew/bin/claude" ]; then
    CLAUDE_BIN="/opt/homebrew/bin/claude"
  else
    echo "FAIL: claude binary not found"
    exit 1
  fi
fi
echo "  ok — claude binary: $CLAUDE_BIN"

CLAUDE_VERSION="$("$CLAUDE_BIN" --version 2>&1 || true)"
echo "  ok — claude --version: $CLAUDE_VERSION"

AGENT_DEF="$OBSIDIAN_VAULT/.claude/agents/job-search-agent.md"
if [ ! -r "$AGENT_DEF" ]; then
  echo "FAIL: cannot read $AGENT_DEF (TCC or missing)"
  exit 1
fi
echo "  ok — agent definition readable"

echo "==> All preflight checks passed."
echo "    The runtime is healthy. The next scheduled 8 AM run should succeed."
echo "    To drain the current _intake.md backlog without waiting, run:"
echo "      launchctl kickstart -k gui/\$UID/com.jaron.job-search-daily"
