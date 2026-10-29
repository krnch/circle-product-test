import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitize } from './report.mjs';

const spec = fs.readFileSync(new URL('./browser/login.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');

test('login waits for the auth API response and reports why it stayed on /login', () => {
  assert.match(spec, /\/api\/v1\/auth\/login/);
  assert.match(spec, /redirect_blocked/);
  assert.match(spec, /blocked_nav=/);
  assert.match(spec, /redact\(parts\.join/);
});

test('dependent cases are BLOCKED login_failed (not silently skipped) when login fails', () => {
  for (const name of ['auth_browse', 'catalog_ui', 'auth_reload', 'auth_logout']) {
    assert.match(spec, new RegExp(`test\\('${name}'[\\s\\S]{0,120}blockedIfNotLoggedIn`), name);
  }
});

test('catalog_ui runs after login via the in-app Explore link', () => {
  assert.match(spec, /test\('catalog_ui'/);
  assert.match(spec, /a\[href="\$\{CATALOG_PATHS\[0\]\}"\]/);
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
