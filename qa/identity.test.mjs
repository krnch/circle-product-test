import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_USERS, SYNTHETIC_TAG, localPart, cleanupId, credentials, plan, classify, addressingMode, emailFor, parseBase } from './identity.mjs';
import { scanPaths, scanPublishSet } from './scan.mjs';

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
  assert.equal(addressingMode({ QA_RUN_ID: 'r' }), 'none');
});

test('MODE A: gmail plus-addressing onto a mailbox we control', () => {
  const a = { QA_RUN_ID: 'run12345', QA_EMAIL_BASE: 'qa.box@gmail.com' };
  assert.equal(addressingMode(a), 'plus_address');
  assert.equal(emailFor(0, a), `qa.box+${localPart(0, a)}@gmail.com`);
  assert.equal(credentials(3, a).email, `qa.box+${localPart(3, a)}@gmail.com`);
  // Case is normalized; the synthetic tag survives into the sub-address.
  assert.equal(emailFor(1, { ...a, QA_EMAIL_BASE: ' QA.Box@GMAIL.com ' }), `qa.box+${localPart(1, a)}@gmail.com`);
  assert.equal(new Set([0, 1, 2, 3].map(i => emailFor(i, a))).size, 4);
});

test('MODE A rejects malformed base addresses instead of guessing', () => {
  for (const bad of ['', '   ', 'nodomain', 'a@b', '@gmail.com', 'x@gmail', 'a b@gmail.com',
                     'a@@gmail.com', 'already+tagged@gmail.com', 'a@-gmail.com', '.a@gmail.com',
                     'a@gmail..com', 'a@gmail.c']) {
    assert.throws(() => parseBase(bad), e => e.blocked === 'malformed_email_base', `should reject: ${JSON.stringify(bad)}`);
  }
  assert.throws(() => credentials(0, { QA_RUN_ID: 'r', QA_EMAIL_BASE: 'bogus' }), e => e.blocked === 'malformed_email_base');
});

test('precedence: QA_EMAIL_BASE wins over QA_EMAIL_DOMAIN', () => {
  const both = { QA_RUN_ID: 'run12345', QA_EMAIL_BASE: 'qa.box@gmail.com', QA_EMAIL_DOMAIN: 'qa-sink.example.com' };
  assert.equal(addressingMode(both), 'plus_address');
  assert.equal(emailFor(0, both), `qa.box+${localPart(0, both)}@gmail.com`);
  // MODE B still works unchanged when base is absent.
  assert.equal(addressingMode(env), 'custom_domain');
  assert.equal(emailFor(0, env), `${localPart(0, env)}@qa-sink.example.com`);
  // A malformed base is a hard error, never a silent downgrade to MODE B.
  assert.throws(() => emailFor(0, { ...both, QA_EMAIL_BASE: 'broken' }), e => e.blocked === 'malformed_email_base');
});

test('generated plus-addresses are caught by the publish secret/PII gate', () => {
  const a = { QA_RUN_ID: 'run12345', QA_EMAIL_BASE: 'qa.box@gmail.com' };
  const addr = credentials(0, a).email;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-scan-'));
  const file = path.join(dir, 'results.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ note: `signed up as ${addr}` }));
    const findings = scanPaths([file]);
    assert.ok(findings.some(f => f.rule === 'email'), 'plus-address must be flagged as sensitive email PII');
    assert.equal(scanPublishSet({ report: file, screenshots: [] }).ok, false);
    // MODE B addresses too.
    fs.writeFileSync(file, credentials(0, env).email);
    assert.equal(scanPublishSet({ report: file, screenshots: [] }).ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
