import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loginEnv, isAllowedNavigation } from './login.mjs';
import { sanitize } from './report.mjs';
import { outputDir } from './output.mjs';

const origin = 'https://getcircle.chat';

test('login comes only from env; missing or partial env yields null (BLOCKED)', () => {
  assert.equal(loginEnv({}), null);
  assert.equal(loginEnv({ CIRCLE_QA_EMAIL: 'x' }), null);
  assert.equal(loginEnv({ CIRCLE_QA_PASSWORD: 'y' }), null);
  assert.deepEqual(loginEnv({ CIRCLE_QA_EMAIL: ' a ', CIRCLE_QA_PASSWORD: 'b' }), { email: 'a', password: 'b' });
});

test('payment block never aborts same-origin static bundles (cart-*.js killed the SPA)', async () => {
  const { isPaymentRequest } = await import('./login.mjs');
  const u = p => new URL(p, origin);
  assert.equal(isPaymentRequest(u('/assets/cart-CC4hSkp1.js'), origin, false), false);
  assert.equal(isPaymentRequest(u('/assets/stripe-COzZ6Zt2.js'), origin, false), false);
  assert.equal(isPaymentRequest(u('/cart'), origin, true), true);
  assert.equal(isPaymentRequest(u('/api/v1/orders/1'), origin, false), true);
  assert.equal(isPaymentRequest(u('/api/v1/payments'), origin, false), true);
  assert.equal(isPaymentRequest(new URL('https://js.stripe.com/v3/'), origin, false), true);
  assert.equal(isPaymentRequest(new URL('https://api.stripe.com/x'), origin, false), true);
  assert.equal(isPaymentRequest(u('/api/v1/auth/login'), origin, false), false);
  // Non-navigation, non-/api/ payment paths stay blocked (e.g. XHR POST /checkout).
  assert.equal(isPaymentRequest(u('/checkout'), origin, false), true);
  assert.equal(isPaymentRequest(u('/billing'), origin, false), true);
  assert.equal(isPaymentRequest(u('/assets/cart/checkout'), origin, false), true, 'non-static under /assets/ is not exempt');
  assert.equal(isPaymentRequest(u('/assets/cart-CC4hSkp1.js'), origin, false, 'POST'), true, 'only GET bundles are exempt');
  const spec = fs.readFileSync(new URL('./browser/login.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(spec, /PAYMENT\.test\(url\.pathname\)/);
  assert.doesNotMatch(spec, /tracing\.start|trace:/, 'no trace: it would capture the typed login');
});

test('navigation allowlist blocks payment, foreign origins and unknown paths', () => {
  // Post-login landing (/dms) and the logged-in catalog must be navigable.
  for (const p of ['/dms', '/explore/shops', '/explore/groups', '/me', '/']) assert.equal(isAllowedNavigation(new URL(origin + p), origin), true, p);
  for (const p of ['/orders', '/money', '/dms/new']) assert.equal(isAllowedNavigation(new URL(origin + p), origin), false, p);
  for (const u of ['/checkout', '/billing', '/admin', 'https://evil.example/']) {
    assert.equal(isAllowedNavigation(new URL(u, origin), origin), false, u);
  }
});

test('auth cases report BLOCKED missing_credentials, never FAIL, and never leak values', () => {
  const r = sanitize(['auth_login', 'auth_browse', 'auth_reload', 'auth_logout']
    .map(label => ({ label, status: 'BLOCKED', reason: 'missing_credentials', email: 'leak' })));
  for (const l of ['auth_login', 'auth_browse', 'auth_reload', 'auth_logout']) {
    const c = r.cases.find(x => x.label === l);
    assert.equal(c.status, 'BLOCKED'); assert.equal(c.reason, 'missing_credentials');
  }
  assert.equal(JSON.stringify(r).includes('leak'), false);
});

test('login spec reads only env, takes no screenshots and never logs credentials', () => {
  const spec = fs.readFileSync(new URL('./browser/login.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(spec, /screenshot|screenshots\.mjs|storageState|console\.log|readFileSync|circleqa\.env/);
  assert.match(spec, /reason: 'missing_credentials'|'missing_credentials'/);
  assert.match(spec, /gate\(process\.env\)\.allowed/, 'live login must be gated by the QA window');
  assert.doesNotMatch(spec, /toBeAttached/, 'auth marker must be visible, not merely attached');
  assert.match(spec, /routeWebSocket\(/, 'websockets must be blocked like the other specs');
  assert.match(spec, /isCI\(\) \? null : loginEnv/, 'login must never be read in CI');
  assert.doesNotMatch(spec, /\.catch\(\(\) => null\)\;\n\s*if \(!res/, 'navigation failures must not be skipped');
});

test('QA_OUTPUT_DIR must be outside the repo', () => {
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('../qa-output', import.meta.url).pathname }));
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('..', import.meta.url).pathname }));
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('../..evidence', import.meta.url).pathname }));
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('../qa/..x', import.meta.url).pathname }));
  const tmp = path.join(os.tmpdir(), 'cqa-out');
  // A symlink outside the repo that points into the checkout must be rejected.
  const link = fs.mkdtempSync(path.join(os.tmpdir(), 'cqa-link-'));
  try {
    fs.symlinkSync(new URL('..', import.meta.url).pathname, path.join(link, 'repo'));
    assert.throws(() => outputDir({ QA_OUTPUT_DIR: path.join(link, 'repo') }));
    assert.throws(() => outputDir({ QA_OUTPUT_DIR: path.join(link, 'repo', 'new', 'deep') }));
  } finally { fs.rmSync(link, { recursive: true, force: true }); }
  assert.equal(outputDir({ QA_OUTPUT_DIR: tmp }), tmp);
  assert.ok(!outputDir({}).startsWith(new URL('..', import.meta.url).pathname));
});

test('.gitignore excludes output, reports, screenshots and env files', () => {
  const ignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  for (const p of ['qa-output/', 'reports/', '*.png', '.env*', 'test-results/', 'playwright-report/']) {
    assert.ok(ignore.split('\n').includes(p), p);
  }
});
