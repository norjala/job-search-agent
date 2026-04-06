#!/bin/bash
# Job Search Agent — Setup Script
# Creates folder structure, copies files, and optionally installs macOS LaunchAgents.
# Safe to run multiple times — won't overwrite existing files unless --force is passed.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE=false
TARGET_DIR=""

# Parse args
for arg in "$@"; do
  case $arg in
    --force) FORCE=true ;;
    *) TARGET_DIR="$arg" ;;
  esac
done

# Default target directory
if [ -z "$TARGET_DIR" ]; then
  echo "Where do you want to set up your job search workspace?"
  echo "  (default: current directory — $(pwd))"
  read -r -p "> " TARGET_DIR
  TARGET_DIR="${TARGET_DIR:-.}"
fi

TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || mkdir -p "$TARGET_DIR" && cd "$TARGET_DIR" && pwd)"
echo ""
echo "Setting up job search agent in: $TARGET_DIR"
echo ""

# --- Create directories ---
echo "Creating directories..."
mkdir -p "$TARGET_DIR/companies"
mkdir -p "$TARGET_DIR/templates"
mkdir -p "$TARGET_DIR/archive"
echo "  ✓ companies/ templates/ archive/"

# --- Copy scaffolding files ---
echo ""
echo "Copying scaffolding files..."
for file in _intake.md _daily-digest.md pipeline.md target-companies.md networking.md interview-learnings.md my-network.md; do
  if [ -f "$TARGET_DIR/$file" ] && [ "$FORCE" = false ]; then
    echo "  ⏭ $file (already exists, use --force to overwrite)"
  else
    cp "$SCRIPT_DIR/scaffolding/$file" "$TARGET_DIR/$file"
    echo "  ✓ $file"
  fi
done

# --- Copy templates ---
echo ""
echo "Copying templates..."
for file in company-research.md company-networking.md company-prep.md company-notes.md conversation-note.md reflection.md; do
  if [ -f "$TARGET_DIR/templates/$file" ] && [ "$FORCE" = false ]; then
    echo "  ⏭ templates/$file (already exists)"
  else
    cp "$SCRIPT_DIR/templates/$file" "$TARGET_DIR/templates/$file"
    echo "  ✓ templates/$file"
  fi
done

# --- Install agent definition ---
echo ""
AGENT_DIR="$HOME/.claude/agents"
AGENT_FILE="$AGENT_DIR/job-search-agent.md"

if [ -f "$AGENT_FILE" ] && [ "$FORCE" = false ]; then
  echo "Agent definition already exists at $AGENT_FILE"
  read -r -p "Overwrite? (y/N) " overwrite
  if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
    echo "  ⏭ Skipping agent definition"
  else
    mkdir -p "$AGENT_DIR"
    cp "$SCRIPT_DIR/agent/job-search-agent.md" "$AGENT_FILE"
    echo "  ✓ Agent definition installed at $AGENT_FILE"
  fi
else
  mkdir -p "$AGENT_DIR"
  cp "$SCRIPT_DIR/agent/job-search-agent.md" "$AGENT_FILE"
  echo "  ✓ Agent definition installed at $AGENT_FILE"
fi

# --- Detect Claude CLI ---
CLAUDE_PATH=""
if command -v claude &>/dev/null; then
  CLAUDE_PATH="$(command -v claude)"
elif [ -f "$HOME/.local/bin/claude" ]; then
  CLAUDE_PATH="$HOME/.local/bin/claude"
fi

# --- Install LaunchAgents (macOS only) ---
echo ""
if [[ "$OSTYPE" == "darwin"* ]]; then
  read -r -p "Install macOS LaunchAgents for daily/weekly scheduling? (y/N) " install_launch
  if [ "$install_launch" = "y" ] || [ "$install_launch" = "Y" ]; then

    read -r -p "What hour should the agent run? (default: 8, 24hr format) " run_hour
    run_hour="${run_hour:-8}"

    if [ -z "$CLAUDE_PATH" ]; then
      echo "  ⚠ Could not find claude CLI. Enter the full path:"
      read -r -p "  > " CLAUDE_PATH
    fi

    LAUNCH_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$LAUNCH_DIR"

    # Daily plist
    DAILY_PLIST="$LAUNCH_DIR/com.job-search-agent.daily.plist"
    sed -e "s|PLACEHOLDER_CLAUDE_PATH|$CLAUDE_PATH|g" \
        -e "s|PLACEHOLDER_WORKING_DIR|$TARGET_DIR|g" \
        -e "s|PLACEHOLDER_HOUR|$run_hour|g" \
        -e "s|PLACEHOLDER_MINUTE|0|g" \
        "$SCRIPT_DIR/scheduling/daily.plist" > "$DAILY_PLIST"
    launchctl load "$DAILY_PLIST" 2>/dev/null || true
    echo "  ✓ Daily LaunchAgent installed (${run_hour}:00 AM)"

    # Weekly plist
    WEEKLY_PLIST="$LAUNCH_DIR/com.job-search-agent.weekly.plist"
    sed -e "s|PLACEHOLDER_CLAUDE_PATH|$CLAUDE_PATH|g" \
        -e "s|PLACEHOLDER_WORKING_DIR|$TARGET_DIR|g" \
        -e "s|PLACEHOLDER_HOUR|$run_hour|g" \
        -e "s|PLACEHOLDER_MINUTE|0|g" \
        "$SCRIPT_DIR/scheduling/weekly.plist" > "$WEEKLY_PLIST"
    launchctl load "$WEEKLY_PLIST" 2>/dev/null || true
    echo "  ✓ Weekly LaunchAgent installed (Monday ${run_hour}:00 AM)"
  else
    echo "  ⏭ Skipping LaunchAgents (you can run the agent manually anytime)"
  fi
else
  echo "Not macOS — skipping LaunchAgent setup."
  echo "See docs/customization.md for Linux cron setup."
fi

# --- Done ---
echo ""
echo "════════════════════════════════════════════"
echo "  Setup complete!"
echo "════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "  1. Add your first role to _intake.md:"
echo "     Open $TARGET_DIR/_intake.md and paste under ## New:"
echo ""
echo "     - Company: Acme Corp"
echo "       Role: Senior PM"
echo "       Link: https://jobs.lever.co/acme/12345"
echo "       Source: LinkedIn"
echo ""
echo "  2. Run the agent:"
echo "     cd $TARGET_DIR"
echo "     claude --print --agent job-search-agent \"Run your daily workflow\""
echo ""
echo "  3. Check the results:"
echo "     Open _daily-digest.md to see what the agent found."
echo ""
echo "  Optional: Create identity.md with your career background"
echo "  and star-stories.md with your interview stories for"
echo "  personalized outreach and interview prep."
echo ""
