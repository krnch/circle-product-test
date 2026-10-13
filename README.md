# Circle public-only 24-hour QA experiment

One GitHub Actions workflow, hourly, one sequential Chromium worker. No local browser execution. This is a deterministic Playwright runner, **not an AI agent**; runner minutes are GitHub compute, not AI inference billing. Historical Hermes testing is recorded separately in `AGENT_RECORD.md` and is unchanged.

## Narrow scope and holds
Only public GET navigation and DOM/native empty-field validity inspection on login, registration, and an explicitly linked public catalog. No submission/click on auth forms, credentials, accounts, purchases, posts or customer data. Requests other than same-origin GET without query are aborted; document navigation is restricted to fixed public routes. WebSockets and service workers are blocked. Missing public catalog is BLOCKED, never inferred as authenticated coverage. Signup, authenticated journeys, payment: BLOCKED (0/4 prior accounts; terms/synthetic-QA eligibility and sandbox unresolved). This tighter experiment overrides broader possibilities in the parent-owned scope document.

## Enable only after publication gates
Parent Security review, then Shadow review must approve actual publication. This builder did not commit, publish, activate, or execute site flows.

On the repository's **default branch**, set repository Actions variables:
- `QA_STARTED_AT`: current UTC, exactly `YYYY-MM-DDTHH:MM:SSZ`.
- `QA_EXPIRES_AT`: later UTC, no more than 24 hours after the start.
- `QA_ENABLED`: exactly `true`, set last.

Missing, malformed, future start, expired, non-UTC, or oversized window fails closed. Disable before changing timestamps; do not refresh the window unattended. Repository variables are administrator-controlled, not secrets. They do not cryptographically prove when an administrator clicked Enable. Each browser request rechecks the window. Schedule runs hourly at minute 17, but GitHub may delay or drop schedules; this is not a guaranteed 24-run service. The workflow must exist on the default branch for scheduling. The PR-only job runs local unit guards, sanitizer and workflow-boundary tests plus syntax checks; it never installs/runs a browser or accesses the site. A separate browser job is restricted at job level to schedule or manual dispatch on the repository's default-branch ref; dispatches from other branches skip it. No fork events or pull_request_target, no secrets, read-only contents permission, credentials not persisted, actions pinned by commit.

## Manual disable
GitHub repository → **Actions → Bounded public QA → … → Disable workflow**. Also set `QA_ENABLED=false`. For an already running job, **Cancel workflow**; disabling scheduling alone does not cancel an in-flight job. Expiry prevents further site requests but does not remove the hourly no-op schedule. Disable workflow after the day.

## Results and verification
Each eligible default-branch schedule or manual-dispatch run is configured to emit a fixed-label summary and JSON-only `public-qa-results` artifact retained one day; other-branch dispatches skip the browser job and emit no receipt. Only route paths and PASS/FAIL/BLOCKED/NOT_RUN statuses are retained: no query strings, error text, console payloads, screenshots, traces or video. Failed checks fail the job; blocked flows are not passes. Setup interruption leaves NOT_RUN. Tomorrow, download the artifacts before expiry and review actual run receipts; no tomorrow report or site coverage is claimed yet.

Local verification (no package install or browser needed):
```sh
npm test
node --check qa/guard.mjs
node --check qa/report.mjs
node --check qa/browser/public.spec.mjs
node --check playwright.config.mjs
```
Node pinned to 22.22.2; Playwright to 1.56.1 and npm lockfile included. Only GitHub runner uses `npm ci --ignore-scripts` and `playwright install --with-deps chromium`. Initial local lock resolution used `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`; it did not download/install a browser.
