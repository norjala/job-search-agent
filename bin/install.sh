#!/bin/bash
# Job Search Agent — Idempotent Installer
#
# Renders the plist templates in launchd/ with real paths, boots out any
# existing daily/weekly/health agents (including legacy com.job-search-agent.*
# labels), loads the fresh ones, and runs dry-run.sh as a smoke test.
#
# Safe to re-run at any time. Use `--repair` to reinstall without re-running
# the smoke test (useful from /daily hard-block recovery).

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian}"
LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"

REPAIR=false
for arg in "$@"; do
  case $arg in
    --repair) REPAIR=true ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

echo "==> Job Search Agent installer"
echo "    Repo:  $REPO_ROOT"
echo "    Vault: $OBSIDIAN_VAULT"
echo ""

# --- Preflight ------------------------------------------------------------
if [ ! -d "$OBSIDIAN_VAULT" ]; then
  echo "ERROR: vault not found at $OBSIDIAN_VAULT" >&2
  echo "       Set OBSIDIAN_VAULT env var or edit the path." >&2
  exit 1
fi

if [ ! -d "$OBSIDIAN_VAULT/work/job-search" ]; then
  echo "ERROR: $OBSIDIAN_VAULT/work/job-search does not exist." >&2
  echo "       Run ./setup.sh first to scaffold the vault workspace." >&2
  exit 1
fi

if command -v claude &>/dev/null; then
  CLAUDE_BIN="$(command -v claude)"
elif [ -x "$HOME/.local/bin/claude" ]; then
  CLAUDE_BIN="$HOME/.local/bin/claude"
elif [ -x "/opt/homebrew/bin/claude" ]; then
  CLAUDE_BIN="/opt/homebrew/bin/claude"
else
  echo "ERROR: claude CLI not found on PATH or in common locations." >&2
  echo "       Install claude-code first, then re-run this script." >&2
  exit 1
fi
echo "    claude: $CLAUDE_BIN"

mkdir -p "$REPO_ROOT/.logs"
mkdir -p "$LAUNCHAGENTS_DIR"

chmod +x "$REPO_ROOT/bin/"*.sh
echo "  ✓ scripts made executable"

# --- Bootout old agents ---------------------------------------------------
OLD_LABELS=(
  "com.jaron.job-search-daily"
  "com.jaron.job-search-weekly"
  "com.jaron.job-search-health"
  "com.job-search-agent.daily"
  "com.job-search-agent.weekly"
)
for label in "${OLD_LABELS[@]}"; do
  if launchctl print "gui/$UID/$label" &>/dev/null; then
    launchctl bootout "gui/$UID/$label" 2>/dev/null || true
    echo "  ✓ bootout $label"
  fi
  if [ -f "$LAUNCHAGENTS_DIR/$label.plist" ]; then
    rm -f "$LAUNCHAGENTS_DIR/$label.plist"
    echo "  ✓ removed stale plist $label.plist"
  fi
done

# --- Render + install new plists ------------------------------------------
NEW_LABELS=(
  "com.jaron.job-search-daily"
  "com.jaron.job-search-weekly"
  "com.jaron.job-search-health"
)
for label in "${NEW_LABELS[@]}"; do
  template="$REPO_ROOT/launchd/$label.plist"
  target="$LAUNCHAGENTS_DIR/$label.plist"
  if [ ! -f "$template" ]; then
    echo "ERROR: template missing: $template" >&2
    exit 1
  fi
  # macOS sed doesn't like | as delim with paths containing |, use @ instead.
  sed \
    -e "s@__REPO_ROOT__@$REPO_ROOT@g" \
    -e "s@__OBSIDIAN_VAULT__@$OBSIDIAN_VAULT@g" \
    -e "s@__CLAUDE_BIN__@$CLAUDE_BIN@g" \
    "$template" > "$target"
  plutil -lint "$target" > /dev/null
  launchctl bootstrap "gui/$UID" "$target"
  echo "  ✓ installed $label"
done

# --- Verify state ---------------------------------------------------------
echo ""
echo "==> Verifying loaded agents"
MISSING=0
for label in "${NEW_LABELS[@]}"; do
  if launchctl print "gui/$UID/$label" &>/dev/null; then
    echo "  ✓ $label (loaded)"
  else
    echo "  ✗ $label (NOT loaded)"
    MISSING=$((MISSING + 1))
  fi
done
if [ "$MISSING" -gt 0 ]; then
  echo "ERROR: $MISSING agents failed to load." >&2
  exit 1
fi

# --- Clear any stale health alert from a prior failure -------------------
ALERT_FILE="$OBSIDIAN_VAULT/work/job-search/_HEALTH_ALERT.md"
if [ -f "$ALERT_FILE" ]; then
  rm -f "$ALERT_FILE" 2>/dev/null && echo "  ✓ cleared stale $ALERT_FILE"
fi

# --- Smoke test (skipped in --repair mode) --------------------------------
if [ "$REPAIR" = false ]; then
  echo ""
  echo "==> Running dry-run preflight"
  if "$REPO_ROOT/bin/dry-run.sh"; then
    echo ""
    echo "════════════════════════════════════════════"
    echo "  ✓ Install complete. Runtime is healthy."
    echo "════════════════════════════════════════════"
  else
    echo ""
    echo "════════════════════════════════════════════"
    echo "  ⚠ Install complete BUT dry-run failed."
    echo "════════════════════════════════════════════"
    echo ""
    echo "The most likely cause is that /bin/bash lacks Full Disk Access."
    echo "Fix (one-time manual step):"
    echo "  1. System Settings → Privacy & Security → Full Disk Access"
    echo "  2. Click +, press ⌘⇧. to show hidden files"
    echo "  3. Navigate to /bin/bash and add it"
    echo "  4. Re-run: ./bin/dry-run.sh to verify"
    exit 1
  fi
else
  echo ""
  echo "  ✓ Repair complete (smoke test skipped)."
fi

echo ""
echo "Next natural run: $(launchctl print "gui/$UID/com.jaron.job-search-daily" 2>&1 | grep -E 'next_run' | head -1 || echo 'tomorrow 8:00 AM')"
echo "To trigger now:   launchctl kickstart -k gui/\$UID/com.jaron.job-search-daily"
