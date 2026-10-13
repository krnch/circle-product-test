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

// Strict base-address validation for plus-addressing. Deliberately conservative:
// a single @, no sub-addressing already present, no whitespace/quoting/unicode.
const BASE_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

export function parseBase(raw) {
  const base = String(raw ?? '').trim();
  if (!base || base.includes('+') || !BASE_RE.test(base)) {
    throw Object.assign(new Error('QA_EMAIL_BASE absent or malformed'), { blocked: 'malformed_email_base' });
  }
  const at = base.lastIndexOf('@');
  return { local: base.slice(0, at).toLowerCase(), domain: base.slice(at + 1).toLowerCase() };
}

// MODE A: plus-addressing onto a mailbox we control (deliverable, verification links receivable).
// MODE B: dedicated QA_EMAIL_DOMAIN. Otherwise: honest BLOCKED, never an invented stranger's inbox.
export function addressingMode(env = process.env) {
  if (env.QA_EMAIL_BASE) return 'plus_address';
  if (env.QA_EMAIL_DOMAIN) return 'custom_domain';
  return 'none';
}

export function emailFor(index, env = process.env) {
  const local = localPart(index, env);
  const mode = addressingMode(env);
  if (mode === 'plus_address') {
    const { local: baseLocal, domain } = parseBase(env.QA_EMAIL_BASE);
    return `${baseLocal}+${local}@${domain}`;
  }
  if (mode === 'custom_domain') return `${local}@${requireDomain(env)}`;
  throw Object.assign(
    new Error('no addressing mode configured: set QA_EMAIL_BASE (plus-addressing) or QA_EMAIL_DOMAIN'),
    { blocked: 'missing_email_domain' },
  );
}

// Builds in-memory credentials. NEVER persist the return value.
export function credentials(index, env = process.env) {
  const email = emailFor(index, env);
  const injected = env[`QA_USER_${index + 1}_PASSWORD`];
  const password = injected && injected.length >= 12
    ? injected
    : `Qa!${crypto.randomBytes(18).toString('base64url')}`;
  return {
    email,
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
