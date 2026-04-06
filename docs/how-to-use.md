# How to Use the Job Search Agent

Step-by-step instructions for every action you'll take. The system does the heavy lifting — you just need to know where to paste, what to update, and when to review.

---

## Daily Routine (~10 min)

1. Open `_daily-digest.md`
2. Review new roles discovered (if any)
3. Review outreach drafts waiting for approval
4. Check follow-up reminders
5. Take action: approve outreach, hold roles, close dead leads

---

## Adding a New Role You Found

**When:** You see a role on LinkedIn, get a referral, or find a posting on a company's careers page.

**Steps:**

1. Open `_intake.md`
2. Under `## New`, paste an entry in this format:

```
- Company: Acme Corp
  Role: Senior Product Manager
  Link: https://jobs.ashbyhq.com/acmecorp/abc123
  Source: LinkedIn
  Notes: AI-native product, strong fit.
```

3. Save the file. Done.

**What happens next:** The agent (runs daily at your configured time) will:
- Create a company folder with research, networking, and notes files
- Add the role to `pipeline.md`
- Research the company (product, market, funding, key people)
- Find networking targets (warm connections + cold outreach)
- Draft outreach messages
- Surface everything in tomorrow's `_daily-digest.md`

**Shortcut:** You can be as minimal as you want. This works too:

```
- Company: Acme Corp
  Role: Staff PM
  Link: https://acmecorp.com/jobs/staff-pm
  Source: referral from a friend
```

---

## Watching a Company (No Specific Role Yet)

**When:** You're interested in a company but they don't have a matching role open right now. You want the system to automatically check for new postings.

**Steps:**

1. Open `target-companies.md`
2. Add a new row to the table:

```
| Acme Corp | ashby | acmecorp | AI-native platform | Staff PM | Growth | Fintech network | PM / AI roles |
```

3. If you don't know the ATS or board ID, just put `unknown` and `—`:

```
| Acme Corp | unknown | — | Strong product team | Senior PM | Late-stage | Dev tools network | PM roles |
```

4. Save the file. Done.

**What happens next:** The agent will:
- **Daily:** Query the company's ATS API (if known) for new matching roles
- **Daily:** If ATS is `unknown`, fall back to web search on their careers page
- **Weekly (Monday):** Run broader discovery searches that may catch this company
- If a matching role appears, it auto-adds to `_intake.md` and flows through the full pipeline

**Finding the ATS and board ID:** Go to the company's careers page and look at the URL:
- `jobs.ashbyhq.com/acmecorp` → ATS: `ashby`, Board ID: `acmecorp`
- `boards.greenhouse.io/acmecorp` → ATS: `greenhouse`, Board ID: `acmecorp`
- `jobs.lever.co/acmecorp` → ATS: `lever`, Board ID: `acmecorp`
- If the careers page is custom (e.g., `careers.acmecorp.com`) → ATS: `unknown`, Board ID: `—`

---

## Moving a Role Through the Pipeline

**When:** You want to change a role's status (e.g., you applied, got an interview, or want to pause it).

**Steps:**

1. Open `pipeline.md`
2. Find the role's row
3. Change the `Status` column to one of:

| Change to | When | What the agent does |
|-----------|------|---------------------|
| `Hold` | You want to pause — not ready to act yet | Agent skips it entirely |
| `Ready to Apply` | Research looks good, you want to apply | Agent generates talking points + STAR story mapping |
| `Applied` | You submitted the application | Agent sets 7-day follow-up reminder |
| `Interviewing` | You have an interview scheduled | Agent generates full prep bundle (predicted questions, STAR mapping, company brief) |
| `Rejected` | You got rejected | Agent generates rejection retro from your notes + updates `interview-learnings.md` |
| `Closed` | Role is dead or you're no longer interested | Agent moves company folder to `archive/` |

4. Update `Last touched` to today's date
5. Update `Next action` with what you need to do next
6. Save. The agent will process the status change on its next run.

---

## After an Interview

**When:** You just finished an interview round.

**Steps:**

1. Open your notes app (Granola, Notion, or anything you use) and copy the transcript or notes
2. Create a new file: `companies/[company]/conversations/YYYYMMDD_round-name.md`
   - Example: `companies/acme-corp/conversations/20260115_phone-screen.md`
3. Paste the transcript or notes
4. Create a reflection file: `companies/[company]/conversations/YYYYMMDD_round-name-reflection.md`
5. Fill in the 3 fields:

```markdown
## Reflection: Acme Corp — Phone Screen
**Date:** 2026-01-15
**Feel:** 4/5
**What I'd do differently:**
Should have opened with the most relevant story earlier.
**Anything to note:**
The interviewer seemed very interested in my 0-to-1 experience.
```

6. Save. Done.

**What happens next:** The agent reads the transcript and your reflection. If you later get rejected, it generates a `rejection-retro.md` analyzing all conversations and updates `interview-learnings.md` with patterns.

---

## Approving Outreach

**When:** The daily digest shows outreach drafts ready for review.

**Steps:**

1. Open the company's `networking.md` (linked from the digest)
2. Read the outreach drafts under "Cold Targets" or "Warm Connections"
3. Edit the drafts to sound like you (the agent writes a starting point, not final copy)
4. Send the message on LinkedIn or email
5. Update the entry's `Status` from "Draft ready" to "Sent"
6. Log it in the Conversation Log table at the bottom

---

## Adding Someone to Your Network

**When:** You realize you know someone at a target company, or you meet someone new who could help.

**Steps:**

1. Open `my-network.md`
2. Add them under the right section:
   - **Former Companies** — if they're from a past employer
   - **Key Relationships** — if they can make intros across multiple companies
   - **Communities & Networks** — if they're from a group or community you're part of
3. Save. The agent references this file when mapping connections for every company.

---

## Removing a Company from Monitoring

**When:** You're no longer interested in a company.

**Steps:**

1. Open `target-companies.md`
2. Delete the company's row
3. The agent will stop scanning their ATS API

If the company also has roles in `pipeline.md`, change their status to `Closed`.

---

## Checking What the Agent Did

**When:** You want to see if the agent ran successfully.

**Steps:**

```bash
# Check the log
cat /tmp/job-search-agent.log

# Check the latest digest
cat /path/to/your/vault/_daily-digest.md

# Check if LaunchAgents are running
launchctl list | grep job-search
```

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Add a role I found | Paste into `_intake.md` under `## New` |
| Watch a company for future roles | Add a row to `target-companies.md` |
| Pause a role | Set status to `Hold` in `pipeline.md` |
| Apply to a role | Set status to `Applied` in `pipeline.md` |
| Prep for an interview | Set status to `Interviewing` — agent generates prep |
| Log an interview | Paste transcript into `companies/[name]/conversations/` |
| Reflect after interview | Create a reflection file (3 fields) |
| Approve outreach | Edit drafts in `companies/[name]/networking.md`, send, update status |
| Add a contact | Add to `my-network.md` |
| Stop watching a company | Delete row from `target-companies.md` |
| Check agent status | `cat /tmp/job-search-agent.log` |
