# Circle QA — 2026-11-17T08:06Z

Run: https://github.com/krnch/circle-product-test/actions/runs/44043647421 (public-smoke: success, logged-in-journey: failure)

| job | case | status | note |
|---|---|---|---|
| public | login_ui | PASS |  |
| public | register_ui | PASS |  |
| public | signup_validation | PASS |  |
| public | catalog_ui | BLOCKED | auth_only_route |
| public | console_errors | BLOCKED | vm_only |
| public | perf_timings | PASS |  |
| public | a11y_basics | PASS |  |
| public | navigation | PASS |  |
| public | payment | BLOCKED |  |
| auth | catalog_ui | BLOCKED | login_failed |
| auth | auth_login | FAIL | page.goto: Timeout 15000ms exceeded. url=/login auth=none |
| auth | auth_browse | BLOCKED | login_failed |
| auth | auth_reload | BLOCKED | login_failed |
| auth | auth_logout | BLOCKED | login_failed |
