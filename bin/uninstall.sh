#!/bin/bash
# Job Search Agent — Uninstaller
# Unloads and removes all LaunchAgents managed by this repo.

set -u

LAUNCHAGENTS_DIR="$HOME/Library/LaunchAgents"
LABELS=(
  "com.jaron.job-search-daily"
  "com.jaron.job-search-weekly"
  "com.jaron.job-search-health"
  # Legacy labels — cleaned up if present.
  "com.job-search-agent.daily"
  "com.job-search-agent.weekly"
)

for label in "${LABELS[@]}"; do
  plist="$LAUNCHAGENTS_DIR/$label.plist"
  if launchctl print "gui/$UID/$label" &>/dev/null; then
    launchctl bootout "gui/$UID/$label" 2>/dev/null || true
    echo "  ✓ bootout $label"
  fi
  if [ -f "$plist" ]; then
    rm -f "$plist"
    echo "  ✓ removed $plist"
  fi
done

echo ""
echo "Uninstalled. Run ./bin/install.sh to reinstall."
