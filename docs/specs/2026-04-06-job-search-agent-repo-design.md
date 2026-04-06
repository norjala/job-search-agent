# Job Search Agent — Design Spec

## What Is This

An open-source, AI-powered job search automation system built on Claude Code and Obsidian. It scans job boards, researches companies, maps your network, drafts outreach messages, generates interview prep, and delivers a daily digest — all while you sleep.

No traditional code. The system is a Claude Code agent definition (markdown instructions), file templates, and macOS scheduling. Fork it, customize it, and run your own automated job search.

**Prerequisites:** [Claude Code CLI](https://claude.ai/code), macOS (for scheduling), Obsidian (optional but recommended)

---

## Repo Structure

```
job-search-agent/
├── README.md
├── LICENSE
├── setup.sh
├── agent/
│   └── job-search-agent.md
├── templates/
│   ├── company-research.md
│   ├── company-networking.md
│   ├── company-prep.md
│   ├── company-notes.md
│   ├── conversation-note.md
│   └── reflection.md
├── scheduling/
│   ├── daily.plist
│   └── weekly.plist
├── scaffolding/
│   ├── _intake.md
│   ├── _daily-digest.md
│   ├── pipeline.md
│   ├── target-companies.md
│   ├── networking.md
│   ├── interview-learnings.md
│   └── my-network.md
└── docs/
    ├── how-to-use.md
    ├── architecture.md
    ├── customization.md
    └── images/
```

---

## Key Design Decisions

- **Fully generic** — no personal references, anyone can fork and use
- **Agent definition is the brain** — all logic lives in markdown instructions that Claude follows
- **Configurable** — identity file, stories file, and target role types are all user-customizable
- **Interactive setup.sh** — creates folders, copies files, optionally installs LaunchAgents
- **Scaffolding files** — empty starters with headers, examples, and inline guides
- **3 docs** — how-to-use (daily workflows), architecture (how it works), customization (adapt for your needs)
- **Screenshots** — from a working system to show what success looks like
