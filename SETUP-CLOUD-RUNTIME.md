# Cloud Runtime — One-Time Credential Setup

This is the manual checklist for the things only you can do (browser auth
flows, GitHub PAT creation, secrets entry). Once these are done, the
GitHub Actions workflows will run on schedule with no further intervention.

**Estimated time: 15 minutes total.**

---

## Step 1 — Mint a Claude Max OAuth token (5 min)

On any Mac where you're logged into Claude Code as your Max account:

```bash
claude setup-token
```

This opens a browser, you confirm, and the terminal prints a token starting
with `sk-ant-oat01-...`. **Copy it immediately** — it won't be shown again.
The token is valid for one year. Calendar a reminder for ~Apr 2027 to rotate.

---

## Step 2 — Create the vault PAT (5 min)

1. Go to https://github.com/settings/personal-access-tokens/new
2. Fill in:
   - **Token name**: `job-finder-agent vault access`
   - **Expiration**: 1 year (`2027-04-27`)
   - **Resource owner**: `norjala`
   - **Repository access**: **Only select repositories** → `norjala/obsidian`
   - **Permissions** → **Repository permissions**:
     - `Contents`: **Read and write**
     - `Metadata`: **Read-only** (auto-enabled)
3. Click "Generate token". Copy it immediately — won't be shown again.

---

## Step 3 — Create a Discord webhook for failure alerts (3 min)

1. In any Discord server you control, create or pick a channel for alerts
   (e.g. `#job-finder`).
2. Right-click channel → **Edit Channel** → **Integrations** → **Webhooks**
   → **New Webhook**.
3. Name it "job-finder-agent". Copy the webhook URL.

(Slack works the same way if you'd rather use that — just adapt the workflow
files. The current scripts post a JSON `{content: "..."}` payload, which both
Discord and Slack accept.)

---

## Step 4 — Add the three secrets to GitHub (2 min)

1. Go to https://github.com/norjala/job-search-agent/settings/secrets/actions
2. Click **New repository secret** three times. Add each:

| Name | Value |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | The `sk-ant-oat01-...` from Step 1 |
| `VAULT_PAT` | The `github_pat_...` from Step 2 |
| `DISCORD_WEBHOOK` | The Discord webhook URL from Step 3 |

---

## Step 5 — Verify with a manual dispatch (3 min)

```bash
gh workflow run manual.yml --repo norjala/job-search-agent \
  -f prompt="Just print the current pipeline summary, then exit. Do not run discovery, do not modify any files." \
  -f max_turns=15

gh run watch --repo norjala/job-search-agent
```

The run should finish in <2 minutes. Inspect the logs in the GitHub Actions
UI. You should see the agent read pipeline.md and print the summary, with no
vault changes committed (since the prompt told it not to modify anything).

If this works, the runtime is healthy. Move to Step 6.

---

## Step 6 — Enable email alerts (1 min)

1. Go to https://github.com/settings/notifications
2. Under **Actions**, set "Send notifications for failed workflows only".
3. Optional: in Gmail, create a filter: `from:notifications@github.com
   "job-finder-agent"` → label "job-finder alerts".

---

## Step 7 — Cutover from Mac Mini (Day 0 → Day 7)

This phases over a week. See `docs/cloud-runtime.md` § "Cutover from the
Mac Mini setup" for the daily checklist. Summary:

- **Today (Day 0)**: secrets done above. The cloud daily will fire tomorrow
  at 07:00 PT. Mac Mini setup remains active. The launchd wrappers have a
  cloud-cutover guard that exits silently if today's cloud run already
  wrote its footer — so no double-runs.
- **Days 1–2**: monitor both. Compare cloud digest quality vs. Mac Mini
  history.
- **Day 3**: disable Mac Mini LaunchAgents:
  ```bash
  launchctl bootout gui/$UID/com.jaron.job-search-daily
  launchctl bootout gui/$UID/com.jaron.job-search-weekly
  launchctl bootout gui/$UID/com.jaron.job-search-health
  ```
- **Day 7**: archive plists, delete obsolete wrappers (next PR).

---

## What to do if Step 5 fails

| Symptom | Likely cause | Fix |
|---|---|---|
| Workflow never starts | Workflow file syntax error | Open Actions tab, look for the lint error |
| Auth error (401 / 403 from claude-code-action) | OAuth token wrong or expired | Re-mint per Step 1, update secret |
| `Permission denied` on vault checkout | PAT scope wrong | Recreate PAT per Step 2 with correct repo + permissions |
| `Permission denied` on push | PAT missing `Contents: write` | Same — recreate |
| Discord step fails | Webhook URL wrong / channel deleted | Recreate webhook, update secret |
| Run completes but nothing committed | Agent had nothing to do (expected for the test prompt) | Compare workflow's "Commit and push" step output |

Worst case: drop the `Discord_webhook` step out of the workflow and let
GitHub email alerts cover failure detection until you fix it.
