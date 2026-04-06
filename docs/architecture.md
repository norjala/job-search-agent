# Architecture

How the job-search-agent system works end to end.

---

## System Flow

```
macOS LaunchAgent (~/Library/LaunchAgents/)
         |
         | triggers on schedule (daily / weekly)
         v
/bin/bash run-job-search-agent.sh
         |
         | executes
         v
claude CLI (--print --agent job-search-agent)
         |
         | loads agent definition + reads vault
         v
job-search-agent.md  (agent instructions)
         |
         |-- reads/writes markdown files (pipeline, intake, networking, etc.)
         |-- calls ATS APIs
         |        |
         |        |-- Greenhouse: https://boards-api.greenhouse.io/v1/boards/{board_id}/jobs
         |        |-- Lever:      https://api.lever.co/v0/postings/{board_id}?mode=json
         |        |-- Ashby:      https://api.ashbyhq.com/posting-api/job-board/{board_id}
         |
         v
Results written to vault markdown files
         |
         | synced automatically
         v
Obsidian Sync  (or any file sync: iCloud, Dropbox, Git)
         |
         v
Available on all devices
```

---

## Daily Workflow (5 Steps)

The agent executes these steps in order on every daily run:

**Step 1 — Role Scanner**
Queries ATS APIs for each company in `target-companies.md`. Compares results against `pipeline.md` to find roles not already tracked. New matches are added to `_intake.md` under `## New` for processing.

**Step 2 — Process Intake**
Reads every entry under `## New` in `_intake.md`. For each:
- Creates `companies/[company-slug]/` folder with `research.md`, `networking.md`, `notes.md`, and `prep.md`
- Researches the company (product, funding, team, market position, key people)
- Cross-references `my-network.md` to identify warm paths
- Drafts outreach messages
- Adds the role to `pipeline.md` at status `To Research`
- Moves the entry to `## Processed` in `_intake.md`

**Step 3 — Auto-Advance Pipeline**
Reads `pipeline.md` and advances roles through stages automatically:

```
To Research  →  Networking  →  (stops here, waits for human approval)
```

Auto-advance logic:
- `To Research` → `Networking`: research file is complete + warm or cold networking path identified
- `Networking` → beyond: **requires human action** (you must manually set status)

The agent also:
- Detects roles at `Applied` with no update for 7+ days → adds follow-up reminder to digest
- Detects roles newly set to `Interviewing` → generates full prep bundle in `companies/[company]/prep.md`
- Detects roles newly set to `Rejected` → generates rejection retro from conversation notes, updates `interview-learnings.md`
- Detects roles newly set to `Closed` → moves company folder to `archive/`

**Step 4 — Follow-up Reminders**
Scans pipeline for:
- `Applied` roles older than 7 days with no status update → surfaces in digest
- `Networking` roles with outreach sent but no reply after 5 days → surfaces in digest

**Step 5 — Generate Daily Digest**
Writes `_daily-digest.md` with:
- New roles discovered (ATS scanner + intake)
- Outreach drafts ready for review
- Follow-ups due
- Pipeline summary by stage
- New learnings (from any retros run this session)
- Delegation recommendations (sub-agents worth dispatching)

---

## Weekly Workflow

On Mondays, the agent runs an extended workflow that includes all daily steps plus:

- **Broad discovery searches** — web searches for new PM/product roles at companies in `target-companies.md` that use unknown or non-standard ATSs
- **Research refresh** — updates research files for companies that have been in the pipeline for 2+ weeks without a status change
- **Network refresh** — checks for new mutual connections at target companies (if LinkedIn CSV is present)

---

## Pipeline Stages and Auto-Advance Chain

```
To Research
    |
    | agent: research complete + networking path found
    v
Networking          <-- agent stops here
    |
    | human: reviews outreach drafts, sends messages
    v
Ready to Apply      <-- human sets this
    |
    | human: submits application
    v
Applied             <-- human sets this
    |
    | agent: 7-day follow-up reminder
    v
Interviewing        <-- human sets this
    |
    | agent: generates prep bundle
    v
Rejected            <-- human sets this
    |
    | agent: rejection retro + interview-learnings update
    v
[end]

Hold                <-- human sets; agent skips entirely
Closed              <-- human or agent (role gone); moves to archive/
```

---

## ATS API Details

The agent queries these three APIs directly — no authentication required (all public job board APIs).

### Greenhouse
```
GET https://boards-api.greenhouse.io/v1/boards/{board_id}/jobs?content=true
```
- `board_id`: the slug from `boards.greenhouse.io/{board_id}`
- Returns all open roles with title, location, and job description
- Filter: title contains keywords like "product manager", "PM", "product lead"

### Lever
```
GET https://api.lever.co/v0/postings/{board_id}?mode=json
```
- `board_id`: the slug from `jobs.lever.co/{board_id}`
- Returns JSON array of postings with title, location, categories, and apply URL
- Filter: categories.team or title contains product-related keywords

### Ashby
```
GET https://api.ashbyhq.com/posting-api/job-board/{board_id}
```
- `board_id`: the slug from `jobs.ashbyhq.com/{board_id}`
- Returns job board JSON with array of job postings
- Filter: department or title contains product-related keywords

---

## Multi-Machine Sync (Optional)

The system is designed for a single machine but works across multiple machines with any file sync solution:

**Obsidian Sync** — the simplest option. All vault files sync automatically across devices. The agent on each machine sees the same state.

**iCloud Drive** — works if your vault is in `~/Library/Mobile Documents/`. Sync is automatic but can lag by seconds to minutes.

**Git** — reliable but requires manual commits. Useful for version history. Not recommended as the primary sync mechanism for a daily-running agent.

**No sync** — if you only run the agent on one machine, no sync is needed.

**Multi-machine agent execution:** If you want the agent to run on two machines (e.g., a laptop and an always-on server), ensure only one runs the agent at a time, or introduce a lock file (`_agent-lock.md`) to prevent concurrent runs.
