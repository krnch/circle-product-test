# Circle Product Test — agent and execution record

## Actual tester
- Framework: Hermes Agent (Nous Research).
- Profile: manager2.
- QA session model: gpt-6.1-sol.
- Provider: copilot.
- Execution: scheduled agent using browser navigation, DOM snapshots, console inspection and visual verification.
- Runtime evidence: the first QA session's stored model/provider metadata was read independently; these are not inferred from a configured default or a role label.
- Independent review: Shadow Manager; a review is not itself a QA execution.

## First observed pass
Observed 2026-10-13 UTC. One actual round executed.

- Planned cases: 9.
- Attempted: 6.
- Passed: 3.
- Failed: 1.
- Blocked: 2.
- Not run: 3.
- Registration submissions: 0.
- Confirmed test accounts: 0 of 4.
- Authenticated user journeys: NOT_RUN.

The first synthetic user's registration stopped before submission while terms/synthetic-QA eligibility was unresolved. The other three users remain NOT_RUN. Two medium UI gaps were reported by the QA worker; independent finding review and sanitized reproduction details are pending. Do not treat their report count as accepted defects or treat scheduled future rounds as completed runs.

Payment: HOLD — provider sandbox/test mode has not been verified. No real charge or checkout submission is authorized.

## Privacy
Account email addresses, passwords, cookies, sessions, private screenshots, user data, billing fields and exploitable security findings are excluded from the public repository. Private evidence remains outside this repo. Only sanitized, reviewed flow results and reproducible non-sensitive gaps may be published.

## Operation
Testing is bounded and may be disabled. No automatic publication, site mutation beyond approved normal test-user flows, security exploitation, third-party messaging or live purchases are permitted. Scheduling and dashboard-control implementation are tracked separately from actual test results.
