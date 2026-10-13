# Circle Product Test

Target: https://getcircle.chat
Public repository: https://github.com/krnch/circle-product-test

## Authorized functional scope
- At most four clearly synthetic test users, registered through the normal website UI.
- Register, log in, browse available product/catalog pages, navigate, log out, return/reload, and verify each test user's own state.
- Low-rate sequential flows; no load tests, endpoint guessing, exploit attempts, access-control bypass, or access to unrelated users' records.
- No messages or notifications to other users, real purchases, merchant orders, identity verification, paid services, or billing activation.
- Payment testing is BLOCKED until provider test mode is explicitly verified. The supplied 4242 test number is never a live payment method. Other card fields are not assumed from the postal code.
- Existing synthetic New Jersey / 07305 location may be used only where needed; do not invent a real street address or person's identity.

## Evidence and public/private separation
- Public artifacts: sanitized scope, test coverage, reproducible non-sensitive UX gaps, timestamps, honest PASS / FAIL / BLOCKED / NOT_RUN status.
- Private artifacts: account addresses/passwords, cookies/session data, raw authenticated screenshots, sensitive implementation/security findings. Store outside this repository in a mode-0700 private directory; never commit or publish them.
- Missing account verification/access/test mode is a blocker, not a pass. A page loading does not prove an end-to-end journey.
- Record actual steps, expected vs actual behavior, console errors, and sanitized evidence references. Do not expose exploitable security details publicly.

## Initial observed status
2026-10-13 UTC: site login and registration pages inspected. Registration form exposes full name, email and password inputs. No accounts created and no checkout attempted by the initial setup turn. Four-user goal remains NOT_RUN.

## Overnight work
Bounded scheduled QA rounds, at most one sequential flow per round, reuse only the four approved test users. Stop on authentication/payment/identity/terms uncertainty, site errors/rate limiting, or an active scope-specific safety hold. Do not create additional users or repeat failed registration blindly.

Public updates require independent redaction review and the applicable publication gates; public repo creation is not blanket permission to publish private test data.
