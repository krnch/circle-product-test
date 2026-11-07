# Circle Product Test

Target: https://getcircle.chat
Public repository: https://github.com/krnch/circle-product-test (CODE ONLY)

## Authorized functional scope
- ONE ACCOUNT ONLY. Every logged-in test uses the single pre-provisioned test account, supplied at run time via env `CIRCLE_QA_EMAIL` / `CIRCLE_QA_PASSWORD`. No other accounts are created or used.
- Logged in: log in, browse available product/catalog pages, navigate, reload (session persists), log out.
- Sign-up: form-validation checks only (field presence, browser-side validity). The form is NEVER submitted; non-GET requests are aborted. No synthetic users, no multi-user flows.
- Low-rate sequential flows; no load tests, endpoint guessing, exploit attempts, access-control bypass, or access to other users' records.
- No messages or notifications to other users, real purchases, merchant orders, identity verification, paid services, or billing activation.
- Payment testing is BLOCKED until provider test mode is explicitly verified.

## Where tests run (hybrid)
- GitHub Actions (`.github/workflows/ci.yml`, on pull_request and push to main): `npm test` unit tests plus the logged-OUT public smoke (`public.spec.mjs`, validation-only `signup.spec.mjs`). Output is pass/fail in the job summary only: no screenshots, no artifacts, no result branches, no secrets.
- GitHub Actions scheduled (`.github/workflows/qa-scheduled.yml`, every 6h + manual, gated by repo var `QA_ENABLED=true`, approved by Karan 2026-10-28): logged-out smoke, then the logged-IN journey (`login.spec.mjs`) with the single test account from repo secrets `QA_LOGIN_EMAIL`/`QA_LOGIN_PASSWORD` (opt-in env `QA_ACTIONS_LOGIN=true`; `ci.yml` never reads the login and reports BLOCKED `ci_not_allowed`). No artifacts/screenshots/traces; secret-guard steps fail the run if a secret value appears. Sanitized PASS/FAIL/BLOCKED table goes to the job summary and `reports/latest.md` + `reports/history.md` on branch `qa-results`. Weekly Squad job: read-only `status`/`cast` + latest report (no model calls).
- VM: optional; no longer required.

## Evidence and public/private separation
- The repo holds code only. Results, screenshots and reports go to `$QA_OUTPUT_DIR`, which `qa/output.mjs` forces to be outside the checkout (symlink-safe).
- Private: the account login, cookies/session data, authenticated screenshots, sensitive findings. Never committed, published, logged or screenshotted.
- Missing login, closed QA window, or missing test mode is BLOCKED, not PASS and not FAIL. A page loading does not prove an end-to-end journey.

## Automated harness boundaries (enforced in code and unit tests)
- `qa/login.mjs` reads the login only from env; missing/partial env => BLOCKED (`missing_credentials`). Live login additionally requires the fail-closed `qa/guard.mjs` window (else `gate_closed`).
- `qa/screenshots.mjs` is the only screenshot path: logged-out allowlisted pages only, refuses a session-bearing context, and is skipped entirely in CI. `login.spec.mjs` and `signup.spec.mjs` never take screenshots.
- `qa/report.mjs` emits fixed labels and allowlisted reasons only; `qa/scan.mjs` scans results and screenshots for emails, tokens, cookies, passwords and card numbers.
- Only the sanitized fixed-label table is published (branch `qa-results`); no artifacts, no screenshots.
