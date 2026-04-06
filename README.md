# Job Search Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Claude](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)](https://claude.ai/code)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha-orange)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**An AI agent that automates your job search while you sleep.**

---

## What It Does

Job Search Agent is an AI-powered job search automation system built on Claude Code and plain Markdown. Drop a role into `_intake.md` and the agent handles everything else: it scans job boards via Greenhouse, Lever, and Ashby APIs to surface matching openings; researches each company's product, funding, team, and recent news; maps your network to find warm introduction paths; drafts personalized outreach messages and follow-ups; generates tailored interview prep including likely questions and talking points; and learns from every post-interview debrief to sharpen future preparation. Each morning you wake up to a 10-minute digest covering new matches, outreach status, upcoming interviews, and pipeline movement — all stored as plain Markdown files you own completely. No SaaS subscriptions, no scrapers, no browser extensions. Just Claude Code and text files.

---

## How It Works

```
1. Add a role        →  Drop the job URL and a few notes into _intake.md
2. Agent researches  →  Overnight, the agent pulls company data, news, and role context
3. Agent maps + drafts →  Finds network connections, drafts outreach and interview prep
4. You review        →  10-minute morning digest — approve, send, move on
```

### Step-by-step

**1. Add a role to `_intake.md`**
Paste the job URL, title, and company. Optionally add notes on why it interests you. That's it.

**2. Agent researches the company overnight**
A scheduled LaunchAgent (macOS) or cron job (Linux) triggers Claude Code to pull company context from public APIs and web sources, score the role against your target criteria, and generate a structured research brief.

**3. Agent maps your network and drafts outreach**
The agent cross-references your contacts (stored as Markdown) against the company and role, ranks warm paths, and drafts first-touch messages and follow-up sequences ready for your review.

**4. You review a 10-minute daily digest**
One Markdown file lands in `digest/` each morning summarizing new matches, outreach to send, interviews to prep for, and pipeline stage changes. Review, approve, archive. Done.

---

## Features

| Feature | Description |
|---|---|
| **Role Scanner** | Polls Greenhouse, Lever, and Ashby APIs on a schedule; filters by title, seniority, and keywords |
| **Auto-Research** | Generates structured company briefs: product, funding, team, press, Glassdoor signal |
| **Network Mapping** | Cross-references your contact list to surface warm introduction paths |
| **Outreach Drafts** | Writes personalized first-touch emails and LinkedIn messages, ready for one-click send |
| **Interview Prep** | Produces role-specific question banks, talking points, and STAR story suggestions |
| **Post-Interview Learning Loop** | Captures debrief notes and feeds them back to sharpen future prep |
| **Daily Digest** | Morning summary of pipeline status, actions needed, and new matches |
| **Pipeline Management** | Tracks application stages in Markdown; auto-advances based on your updates |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-username/job-search-agent.git
cd job-search-agent

# 2. Run setup (installs Claude Code CLI check, creates folder structure, registers scheduler)
./setup.sh

# 3. Add your first role
echo "- [ ] https://jobs.ashby.com/example-company/example-role | Senior PM | Example Co" >> _intake.md

# 4. Run the agent manually for the first time
claude --headless "Run the job search agent: process _intake.md, research new roles, update pipeline"
```

The scheduler will take over from there, running nightly and dropping a digest in `digest/` each morning.

---

## Prerequisites

- **[Claude Code CLI](https://claude.ai/code)** — the only hard dependency; install and authenticate before running `setup.sh`
- **macOS** — the default scheduler uses a LaunchAgent plist. Linux works fine with a cron job (see [docs/scheduling.md](docs/scheduling.md))
- **[Obsidian](https://obsidian.md)** *(optional but recommended)* — the vault structure is Obsidian-native, giving you a clean UI for reviewing digests, browsing research briefs, and managing your pipeline. Entirely optional; all files are plain Markdown and work in any editor.

---

## Documentation

- [How to Use](docs/how-to-use.md) — detailed walkthrough from intake to offer
- [Architecture](docs/architecture.md) — folder structure, agent loop, file conventions
- [Customization](docs/customization.md) — adapting filters, prompts, and scheduling to your workflow

---

## Screenshots

<!-- screenshot: daily digest in Obsidian -->
*Daily digest view — coming soon*

<!-- screenshot: pipeline kanban -->
*Pipeline management view — coming soon*

<!-- screenshot: company research brief -->
*Auto-generated company research brief — coming soon*

<!-- screenshot: outreach draft -->
*Outreach draft ready for review — coming soon*

---

## Contributing

Contributions are welcome. To contribute:

1. Fork the repo and create a branch (`git checkout -b feature/your-feature`)
2. Make your changes — keep new files as Markdown or shell scripts where possible
3. Open a pull request with a clear description of what changed and why

Bug reports and feature requests go in [Issues](../../issues). Please include your OS, Claude Code version, and a minimal reproduction if reporting a bug.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guidelines.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Built With

[Claude Code](https://claude.ai/code) by Anthropic — the agent runtime, researcher, writer, and scheduler backbone that makes this possible without a single line of traditional application code.
