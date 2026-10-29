# Squad Team

> circle-product-test — deterministic Playwright QA code for getcircle.chat

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Lead | Lead | .squad/agents/lead/charter.md | active |
| Tester | Tester | .squad/agents/tester/charter.md | active |
| Scribe | Scribe | .squad/agents/scribe/charter.md | active |

## Project Context

- Project: circle-product-test (PUBLIC repo, code only)
- Stack: Node 22, @playwright/test, node:test unit tests (`npm test`)

## Hard rules (all members)

- Code only. Never push QA results, screenshots, reports or logs to this repo, its branches, issues or Actions.
- Never open GitHub issues containing findings. Never auto-assign agents or issues. No triage/heartbeat/issue-assign workflows.
- Never read, print or store credentials. Tests get the login only from env CIRCLE_QA_EMAIL / CIRCLE_QA_PASSWORD at run time.
- All run output goes to $QA_OUTPUT_DIR (outside the repo).
