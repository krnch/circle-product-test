// CI detection. GitHub Actions sets CI=true and GITHUB_ACTIONS=true.
export function isCI(env = process.env) {
  return env.CI === 'true' || env.GITHUB_ACTIONS === 'true';
}
// Logged-in QA may read the login env only off-CI (VM) or in the dedicated scheduled
// Actions workflow (qa-scheduled.yml), which sets QA_ACTIONS_LOGIN=true. ci.yml never does.
export function loginAllowed(env = process.env) {
  return !isCI(env) || env.QA_ACTIONS_LOGIN === 'true';
}
