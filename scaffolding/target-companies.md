# Target Companies

Companies worth repeated monitoring. The job-search-agent scans these daily via ATS APIs and weekly via web search.

**ATS values:** `greenhouse`, `lever`, `ashby`, `workable`, `unknown`
**Board ID:** Usually the company slug used in their job board URL.

## How to Find a Company's ATS

Go to the company's careers page and look at the URL pattern:

| URL pattern | ATS | Board ID example |
|-------------|-----|-----------------|
| `boards.greenhouse.io/acmecorp` | `greenhouse` | `acmecorp` |
| `jobs.lever.co/acmecorp` | `lever` | `acmecorp` |
| `jobs.ashbyhq.com/acmecorp` | `ashby` | `acmecorp` |
| `acmecorp.workable.com` | `workable` | `acmecorp` |
| Custom careers page (e.g. `careers.acmecorp.com`) | `unknown` | `—` |

If ATS is `unknown`, the agent falls back to web search on their careers page instead of using the API.

Some companies use non-standard ATSs (Workday, iCIMS, Taleo) — set those to `unknown` and the agent will use web search.

## Companies

| Company | ATS | Board ID | Why target | Role types | Stage | Network angle | Watch for |
|---------|-----|----------|------------|------------|-------|---------------|-----------|
