// CI detection. GitHub Actions sets CI=true and GITHUB_ACTIONS=true.
// Logged-in QA never runs in CI: it is VM-only (circleqa agent).
export function isCI(env = process.env) {
  return env.CI === 'true' || env.GITHUB_ACTIONS === 'true';
}
