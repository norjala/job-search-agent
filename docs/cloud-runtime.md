# Cloud Runtime — Operating Manual

This is the canonical runtime for the job-search agent: GitHub Actions cron
that checks out the vault, runs the agent via `anthropics/claude-code-action@v1`,
and commits results back. Replaces the Mac Mini launchd setup documented in
`docs/scheduling-setup.md` (kept for reference and as a fallback during the
soak period).

## Architecture in one paragraph

A cron-triggered GitHub Actions workflow (defined in this runtime repo)
checks out the private vault (`norjala/obsidian`) directly into the GitHub
Actions workspace, runs the `job-search-agent` definition that lives at
`vault-root/.claude/agents/job-search-agent.md`, then commits any vault
changes back via a fine-grained PAT. The runtime repo's content isn't
checked out at run-time — the workflow file is enough; everything operational
is in the vault.

A separate watchdog workflow runs every 4 hours and writes `_HEALTH_ALERT.md`
(plus pings a Discord webhook) if the digest hasn't been committed in 26+
hours. All workflows have a 30-minute `timeout-minutes` so a hung run is
impossible by construction.

## Workflows

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/daily.yml` | cron `0 14 * * *` (07:00 PT during DST) + dispatch | Main daily run |
| `.github/workflows/weekly.yml` | cron `0 13 * * 1` (06:00 PT Mon during DST) + dispatch | Weekly: daily + broad discovery + Rank-1 research refresh |
| `.github/workflows/watchdog.yml` | cron `0 */4 * * *` | Stale-digest detector and alerter |
| `.github/workflows/manual.yml` | dispatch only | One-shot run with optional prompt/turns/model overrides |

GH Actions cron is best-effort — busy-window skips happen. The watchdog is
the safety net that catches missed runs.

## Required secrets (configure on `github.com/norjala/job-search-agent`)

| Secret | How to mint | Purpose |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Run `claude setup-token` locally; copy the `sk-ant-oat01-...` value (1-year lifespan) | Authenticates the action to your Claude Max subscription so LLM calls have zero marginal cost |
| `VAULT_PAT` | GitHub → Settings → Developer settings → Fine-grained PAT. Resource owner: `norjala`. Repository access: only `norjala/obsidian`. Permissions: `Contents: read and write`, `Metadata: read`. 1-year expiration. | Lets CI clone and push the private vault repo |
| `DISCORD_WEBHOOK` | Create a Discord channel, Edit Channel → Integrations → Webhooks → New | Failure / staleness alerts. Optional — workflows skip the notify step gracefully if unset |

## First-time setup

1. **Mint the OAuth token** on a machine where you're already logged into
   Claude Code as your Max account:
   ```
   claude setup-token
   ```
   Copy the `sk-ant-oat01-...` output.
2. **Create the vault PAT** as described above. Save the token immediately —
   GitHub only shows it once.
3. **Create the Discord webhook**. Save the URL.
4. **Add all three secrets** to this repo's settings → Secrets and variables
   → Actions → New repository secret.
5. **Verify with a dispatch run**:
   ```
   gh workflow run daily.yml --repo norjala/job-search-agent -f prompt_override="Just print the current pipeline summary; don't run discovery."
   gh run watch
   ```
   The run should complete in <2 minutes with the prompt above. Inspect the
   vault for any commits that landed.
6. **Enable email alerts**: GitHub repo → Settings → Notifications → "Send
   notifications for failed workflows only." Filter the resulting email in
   Gmail into a "job-finder alerts" label.

## Rotating the OAuth token

The token expires after one year. About a month before expiry:

1. Run `claude setup-token` again (your existing token continues to work
   until the new one is saved).
2. Update the `CLAUDE_CODE_OAUTH_TOKEN` secret on the repo.
3. Manually dispatch `daily.yml` to confirm the new token works.

A calendar reminder ~11 months out is the easy lift.

## Debugging a failed run

1. Open the failed run in the Actions UI. Read the step logs.
2. The most common failure modes:
   - **Auth**: token expired or wrong scope. Re-mint per above.
   - **Vault PAT lost permissions**: regenerate fine-grained PAT.
   - **Vault merge conflict**: extremely rare, but `git pull --rebase` in the
     commit step can fail if Obsidian Sync wrote a conflicting commit
     simultaneously. Resolve manually with `git pull --rebase` locally and
     retrigger the run.
   - **Agent ran out of turns**: bump `--max-turns` in the workflow's
     `claude_args`.
3. After fixing, re-run via the Actions UI's "Re-run failed jobs" or:
   ```
   gh run rerun <run-id> --repo norjala/job-search-agent
   ```
4. To clear the `_HEALTH_ALERT.md` file: a successful run automatically
   removes it (the workflow's first vault step is `rm -f _HEALTH_ALERT.md`).

## Cutover from the Mac Mini setup

Phased over ~1 week — see the plan file at
`/Users/jaron/.claude/plans/do-a-deep-review-tender-nova.md` (Day-by-day
playbook in §A.8). Summary:

- **Day 0**: deploy workflows + secrets, dispatch manually 2–3 times to
  confirm clean runs.
- **Days 1–2**: cloud daily + Mac Mini both enabled. Mac Mini wrappers have
  a "cloud-cutover guard" at the top that exits silently if today's cloud
  run already wrote its footer.
- **Day 3**: disable Mac Mini LaunchAgents (`launchctl bootout
  gui/$UID/com.jaron.job-search-daily` and `...weekly`). Keep `...health`
  off, watchdog handles staleness now.
- **Day 7**: archive launchd plists to `archive/launchd/`, delete the
  obsolete wrapper scripts (`bin/run-*.sh`, `bin/health-check.sh`,
  `bin/install.sh`, `bin/dry-run.sh`, `bin/uninstall.sh`).

## Fallback to the Mac Mini

If the cloud setup misbehaves badly during soak:

```
# from ~/Workspace/job-finder-agent
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.jaron.job-search-daily.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.jaron.job-search-weekly.plist
```

Recovery time: <2 minutes. Don't disable `bin/install.sh` or remove
the plist templates until you're confident the cloud runtime has soaked
for at least a week without intervention.

## Why this is robust where launchd wasn't

| Failure mode that killed the launchd setup | Why cloud avoids it |
|---|---|
| OOM on shared Mac Mini (Apr 21–27 outage) | Each run gets a fresh ubuntu VM with 7GB RAM; nothing else competes |
| TCC blocking launchd-spawned bash from vault | No filesystem permission system involved |
| Claude auto-update breaking `getcwd()` in TCC zone | `claude-code-action@v1` is pinned and runs in a clean environment |
| Orphan claude processes holding shared locks | No state persists between runs |
| Self-trapping health-check waiting on hung process | Watchdog checks digest mtime, never "is a process running" — and runs are bounded by `timeout-minutes: 30` |
| Missing FDA on `/bin/bash` after macOS upgrade | No macOS involved |

## What still requires human attention

- **Vault repo merge conflicts**, if Obsidian Sync writes simultaneously. Rare
  but manual resolution.
- **OAuth token rotation** annually.
- **Vault PAT rotation** annually.
- **Reading the digest** — automation surfaces, humans decide.
