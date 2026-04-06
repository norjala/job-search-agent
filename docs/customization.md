# Customization Guide

How to adapt the job-search-agent to your specific needs.

---

## Change Target Role Types

**When:** You're searching for a different type of role (e.g., engineering manager instead of PM, or you want to narrow/expand what the agent surfaces from ATS scans).

**How:** Open your agent definition file (e.g., `.claude/agents/job-search-agent.md`) and find the section describing role filtering keywords. Update the title keywords list.

Example — default PM keywords:
```
product manager, PM, product lead, staff PM, principal PM, director of product,
head of product, product operations, founding PM, technical PM
```

Example — modified for engineering manager search:
```
engineering manager, EM, engineering lead, staff engineer, director of engineering,
head of engineering, VP engineering, technical lead
```

The agent applies these keywords when filtering ATS API results and when running web searches for target companies with unknown ATSs.

---

## Add New ATS Platforms

**When:** A company you want to track uses an ATS not natively supported (Workday, iCIMS, Taleo, Rippling, Lever Enterprise, etc.).

**Option A — Mark as `unknown` and use web search:**
In `target-companies.md`, set ATS to `unknown` and Board ID to `—`. The agent will fall back to a web search on the company's careers page. Less reliable but requires no additional configuration.

**Option B — Add direct support to the agent definition:**
If the ATS has a public JSON API, add a new handler in your agent definition. Most ATSs follow a similar pattern:

1. Find the API endpoint (check network requests on the careers page using browser DevTools)
2. Add the endpoint pattern to the agent's ATS handler section:
   ```
   Platform: myats
   Endpoint: https://api.myats.com/jobs/{board_id}/openings
   Board ID source: URL slug at jobs.myats.com/{board_id}
   Filter field: title or department
   ```
3. Update `target-companies.md` to use the new ATS value

**Option C — Scrape the careers page:**
For companies with fully custom careers pages, add a `careers_url` field to `target-companies.md` and configure the agent to fetch and parse that URL. This is fragile (breaks when the page structure changes) but works as a fallback.

---

## Change the Schedule

**Option A — Re-run setup:**
If you used the `setup.sh` script, re-run it and enter different times when prompted.

**Option B — Edit the plist directly:**
Open `~/Library/LaunchAgents/com.job-search-agent.daily.plist` and change the `Hour` and `Minute` values:

```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key>
    <integer>8</integer>    <!-- change to desired hour (0-23, local time) -->
    <key>Minute</key>
    <integer>30</integer>   <!-- change to desired minute (0-59) -->
</dict>
```

Then reload the LaunchAgent:
```bash
launchctl unload ~/Library/LaunchAgents/com.job-search-agent.daily.plist
launchctl load ~/Library/LaunchAgents/com.job-search-agent.daily.plist
```

**Option C — Change weekly day:**
In the weekly plist, change `Weekday` from `1` (Monday) to any value `1-7` (1=Monday, 7=Sunday):
```xml
<key>Weekday</key>
<integer>5</integer>   <!-- Friday -->
```

---

## Run Without Obsidian

The agent reads and writes plain Markdown files. Obsidian is not required — it's just a convenient interface for viewing and editing the vault.

**To run without Obsidian:**
- Any text editor works: VS Code, Cursor, Vim, Sublime, etc.
- The `[[wikilinks]]` syntax in files is just a convention — the agent understands relative file paths
- The `_daily-digest.md` file is the main output; you can open it in any Markdown viewer
- Obsidian Sync is optional — see the architecture doc for alternative sync options

**Tip:** VS Code with the Foam or Dendron extension gives you a similar linked-notes experience to Obsidian.

---

## Run Without macOS

The LaunchAgent scheduling system is macOS-only. On other platforms, use cron or a process manager.

### Linux — cron

```bash
# Open crontab
crontab -e

# Daily at 6 AM
0 6 * * * /bin/bash /path/to/run-job-search-agent.sh >> /tmp/job-search-agent.log 2>&1

# Weekly on Monday at 6 AM
0 6 * * 1 /bin/bash /path/to/run-job-search-agent-weekly.sh >> /tmp/job-search-agent.log 2>&1
```

### Linux — systemd timer

Create a service file and a timer file in `~/.config/systemd/user/`. This is more reliable than cron for long-running processes.

```ini
# ~/.config/systemd/user/job-search-agent.service
[Unit]
Description=Job Search Agent

[Service]
Type=oneshot
ExecStart=/bin/bash /path/to/run-job-search-agent.sh

# ~/.config/systemd/user/job-search-agent.timer
[Unit]
Description=Run Job Search Agent Daily

[Timer]
OnCalendar=*-*-* 06:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable: `systemctl --user enable --now job-search-agent.timer`

### Manual runs (any platform)

```bash
cd /path/to/your/vault
claude --print --agent job-search-agent "Run your daily workflow. Today is $(date +%Y-%m-%d)."
```

---

## Import LinkedIn Connections CSV for Network Cross-Referencing

LinkedIn lets you export your connections as a CSV. The agent uses this to find connections at companies during research.

**Export steps:**
1. Go to LinkedIn → Me → Settings & Privacy
2. Data Privacy → Get a copy of your data
3. Select "Connections" → Request archive
4. Download the CSV when you receive the email (usually within 10 minutes)
5. Save as `linkedin-connections.csv` in your vault root (same directory as `pipeline.md`)

**CSV format:** LinkedIn exports connections in this format:
```
First Name, Last Name, URL, Email Address, Company, Position, Connected On
```

**How the agent uses it:**
When researching a company, the agent searches `linkedin-connections.csv` for rows where the `Company` column matches the company name (or common variations). Matches are added to the `## Warm Connections` section of the company's `networking.md`.

**Keep it fresh:** Re-export every few weeks. The agent uses the `Connected On` date to identify recently added connections.

**Privacy note:** This file contains personal data (names, emails, LinkedIn URLs). Do not commit it to a public git repository. Add `linkedin-connections.csv` to your `.gitignore`.
