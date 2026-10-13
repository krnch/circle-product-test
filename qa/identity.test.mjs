import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_USERS, SYNTHETIC_TAG, localPart, cleanupId, credentials, plan, classify } from './identity.mjs';

const env = { QA_RUN_ID: 'run12345', QA_EMAIL_DOMAIN: 'qa-sink.example.com' };

test('at most four users, clearly synthetic, unique', () => {
  assert.equal(MAX_USERS, 4);
  assert.throws(() => localPart(4, env));
  assert.throws(() => localPart(-1, env));
  const parts = [0, 1, 2, 3].map(i => localPart(i, env));
  assert.equal(new Set(parts).size, 4);
  for (const p of parts) assert.ok(p.startsWith(SYNTHETIC_TAG));
  assert.equal(plan(99, env).length, 4);
  assert.equal(plan(2, { ...env, QA_USER_COUNT: '2' }).length, 2);
  assert.equal(plan(99, { ...env, QA_USER_COUNT: '10' }).length, 4);
});

test('no credential is hardcoded in the source and passwords are runtime-derived', () => {
  const src = fs.readFileSync(new URL('./identity.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /password\s*[:=]\s*['"`][^'"`]{6,}['"`]/i);
  const a = credentials(0, env), b = credentials(0, env);
  assert.notEqual(a.password, b.password, 'generated passwords must not be deterministic');
  assert.ok(a.password.length >= 20);
  assert.equal(a.email, `${localPart(0, env)}@qa-sink.example.com`);
  const injected = credentials(1, { ...env, QA_USER_2_PASSWORD: 'x'.repeat(24) });
  assert.equal(injected.password, 'x'.repeat(24));
});

test('missing email domain secret blocks rather than inventing a domain', () => {
  assert.throws(() => credentials(0, { QA_RUN_ID: 'r' }), e => e.blocked === 'missing_email_domain');
  assert.throws(() => credentials(0, { QA_RUN_ID: 'r', QA_EMAIL_DOMAIN: 'not a domain' }));
});

test('cleanup record carries no sensitive material', () => {
  const c = cleanupId(2, env);
  assert.deepEqual(Object.keys(c).sort(), ['index', 'local_part', 'synthetic']);
  assert.equal(JSON.stringify(c).includes('@'), false);
});

test('blockers are reported honestly and never converted to a pass', () => {
  assert.deepEqual(classify({ visibleText: 'Please complete the reCAPTCHA' }), { status: 'BLOCKED', reason: 'captcha_challenge' });
  assert.deepEqual(classify({ visibleText: 'Verify your email to continue' }), { status: 'BLOCKED', reason: 'email_verification_required' });
  assert.deepEqual(classify({ visibleText: 'Too many requests' }), { status: 'BLOCKED', reason: 'rate_limited' });
  assert.equal(classify({ status: 429 }).reason, 'rate_limited');
  assert.equal(classify({ status: 503 }).reason, 'server_error_503');
  assert.equal(classify({ visibleText: 'Registration is invite only' }).reason, 'registration_closed');
  assert.equal(classify({ visibleText: 'Email already registered' }).status, 'FAIL');
  assert.deepEqual(classify({ navigatedTo: '/dashboard' }), { status: 'PASS', reason: 'registered' });
  // Silence is not success.
  assert.deepEqual(classify({ visibleText: '', navigatedTo: '/register' }), { status: 'BLOCKED', reason: 'no_authenticated_state_observed' });
});

test('signup spec attempts submit exactly once and blocks payment surfaces', () => {
  const spec = fs.readFileSync(new URL('./browser/signup.spec.mjs', import.meta.url), 'utf8');
  assert.equal((spec.match(/\.click\(/g) || []).length, 1, 'single submit attempt, no blind retry');
  assert.match(spec, /PAYMENT\.test\(url\.pathname\)/);
  assert.doesNotMatch(spec, /retries/);
});
