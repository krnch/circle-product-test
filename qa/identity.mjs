// Synthetic test identities for the four authorized QA users (QA_SCOPE.md).
//
// Credentials are EITHER injected from GitHub Actions secrets at run time OR generated
// in-process. They are never hardcoded here and never written into the repository:
// only the non-sensitive local-part identifier is recorded, for cleanup.
import crypto from 'node:crypto';

export const MAX_USERS = 4;
export const SYNTHETIC_TAG = 'circle-qa-synthetic';

// Obvious-to-a-human synthetic marker, stable per run id so cleanup is possible.
export function runId(env = process.env) {
  const raw = env.QA_RUN_ID || env.GITHUB_RUN_ID || Date.now().toString(36);
  return String(raw).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-10);
}

export function localPart(index, env = process.env) {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_USERS) throw new Error(`user index out of authorized range 0..${MAX_USERS - 1}: ${index}`);
  return `${SYNTHETIC_TAG}-${runId(env)}-${index + 1}`;
}

// Non-sensitive cleanup identifier. Deliberately excludes domain-qualified address,
// password and any session material.
export function cleanupId(index, env = process.env) {
  return { index, local_part: localPart(index, env), synthetic: true };
}

function requireDomain(env) {
  const domain = env.QA_EMAIL_DOMAIN;
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    throw Object.assign(new Error('QA_EMAIL_DOMAIN secret absent or malformed'), { blocked: 'missing_email_domain' });
  }
  return domain.toLowerCase();
}

// Builds in-memory credentials. NEVER persist the return value.
export function credentials(index, env = process.env) {
  const local = localPart(index, env);
  const domain = requireDomain(env);
  const injected = env[`QA_USER_${index + 1}_PASSWORD`];
  const password = injected && injected.length >= 12
    ? injected
    : `Qa!${crypto.randomBytes(18).toString('base64url')}`;
  return {
    email: `${local}@${domain}`,
    password,
    fullName: `QA Synthetic ${index + 1}`,
    cleanup: cleanupId(index, env),
  };
}

export function plan(count, env = process.env) {
  const n = Math.min(Number(env.QA_USER_COUNT ?? count ?? MAX_USERS) || 0, MAX_USERS);
  if (n < 0) throw new Error('negative user count');
  return Array.from({ length: n }, (_, i) => i);
}

// Classify an observed registration outcome. Never invents a pass.
const BLOCKERS = [
  [/captcha|recaptcha|hcaptcha|turnstile/i, 'captcha_challenge'],
  [/verify your email|verification (email|link)|confirm your email/i, 'email_verification_required'],
  [/too many|rate limit|slow down|try again later/i, 'rate_limited'],
  [/invite|waitlist|not accepting|closed registration/i, 'registration_closed'],
  [/accept the terms|must agree to|consent required/i, 'consent_required'],
];
export function classify({ visibleText = '', status = 0, navigatedTo = '' } = {}) {
  for (const [re, reason] of BLOCKERS) if (re.test(visibleText)) return { status: 'BLOCKED', reason };
  if (status === 429) return { status: 'BLOCKED', reason: 'rate_limited' };
  if (status >= 500) return { status: 'BLOCKED', reason: `server_error_${status}` };
  if (/^\/(dashboard|home|app|account|onboarding)/.test(navigatedTo)) return { status: 'PASS', reason: 'registered' };
  if (/error|invalid|failed|already (exists|registered)/i.test(visibleText)) return { status: 'FAIL', reason: 'registration_rejected' };
  return { status: 'BLOCKED', reason: 'no_authenticated_state_observed' };
}
