import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Reporter, { sanitize } from './report.mjs';

const spec = fs.readFileSync(new URL('./browser/login.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');

test('login waits for the auth API response and reports why it stayed on /login', () => {
  assert.match(spec, /\/api\/v1\/auth\/login/);
  assert.match(spec, /redirect_blocked/);
  assert.match(spec, /blocked_nav=/);
  assert.match(spec, /redact\(parts\.join/);
});

test('one journey test keeps the session; dependents are BLOCKED login_failed', () => {
  assert.equal((spec.match(/^test\(/gm) || []).length, 1, 'single journey test (worker restart would drop the session)');
  assert.doesNotMatch(spec, /mode: 'serial'/);
  for (const name of ['auth_browse', 'catalog_ui', 'auth_reload', 'auth_logout']) {
    assert.match(spec, new RegExp(`step\\('${name}', true,`), name);
  }
  assert.match(spec, /step\('auth_login', false,/);
  assert.match(spec, /'BLOCKED', 'login_failed'/);
});

test('catalog_ui runs after login via the in-app Explore link', () => {
  assert.match(spec, /a\[href="\$\{CATALOG_PATHS\[0\]\}"\]/);
});

test('reporter expands qa-step attachments into independent cases', () => {
  const r = new Reporter();
  const att = o => ({ name: 'qa-step', body: Buffer.from(JSON.stringify(o)) });
  r.onTestEnd({ title: 'auth_journey' }, { status: 'failed', attachments: [
    att({ label: 'auth_login', status: 'PASS' }),
    att({ label: 'auth_browse', status: 'FAIL', detail: 'HTTP 500 for /dms' }),
    att({ label: 'catalog_ui', status: 'PASS' }),
    att({ label: 'auth_logout', status: 'PASS' }),
  ] });
  const s = sanitize(r.results);
  const c = l => s.cases.find(x => x.label === l);
  assert.equal(c('auth_login').status, 'PASS');
  assert.equal(c('auth_browse').status, 'FAIL');
  assert.equal(c('catalog_ui').status, 'PASS');
  assert.equal(c('auth_logout').status, 'PASS');
  assert.equal(r.results.some(x => x.label === 'auth_journey'), false);
});

test('logged-in catalog_ui result wins over the logged-out auth_only_route BLOCKED', () => {
  const r = sanitize([
    { label: 'catalog_ui', status: 'BLOCKED', reason: 'auth_only_route' },
    { label: 'catalog_ui', status: 'PASS' },
  ]);
  assert.equal(r.cases.find(c => c.label === 'catalog_ui').status, 'PASS');
  const b = sanitize([{ label: 'auth_browse', status: 'BLOCKED', reason: 'login_failed' }, { label: 'auth_login', status: 'FAIL', reason: 'redirect_blocked', detail: 'api=200 blocked_nav=/dms' }]);
  assert.equal(b.cases.find(c => c.label === 'auth_browse').reason, 'login_failed');
  assert.equal(b.cases.find(c => c.label === 'auth_login').detail, 'api=200 blocked_nav=/dms');
});
