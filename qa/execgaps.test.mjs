import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { triageErrors, KNOWN_ISSUES } from './known-issues.mjs';
import { redact, SUBMIT } from './login.mjs';
import { sanitize } from './report.mjs';

const CSP = "Refused to load the script 'https://static.cloudflareinsights.com/beacon.min.js/vabc' because it violates the following Content Security Policy directive: \"script-src 'self'\"";

test('known CSP beacon issue is classified KNOWN; anything else stays new', () => {
  assert.deepEqual(triageErrors([CSP, CSP, 'TypeError: boom']), { known: ['csp_blocks_cloudflare_insights'], fresh: ['TypeError: boom'] });
  assert.deepEqual(triageErrors([CSP]), { known: ['csp_blocks_cloudflare_insights'], fresh: [] });
  // Not a blanket whitelist: other CSP refusals and other cloudflare errors stay new.
  assert.equal(triageErrors(["Refused to load the script 'https://evil.example/x.js' because it violates the following Content Security Policy directive"]).fresh.length, 1);
  assert.equal(triageErrors(['static.cloudflareinsights.com 500']).fresh.length, 1);
  for (const k of KNOWN_ISSUES) assert.match(k.id, /^[a-z0-9_]+$/);
});

test('login submit name matches the real "Sign in" button only', () => {
  assert.ok(SUBMIT.test('Sign in'));
  assert.ok(SUBMIT.test(' Log in '));
  assert.ok(!SUBMIT.test('Continue with Google'));
  assert.ok(!SUBMIT.test(''));
});

test('redact removes the login values and any email from inline error text', () => {
  const creds = { email: 'qa.person@example.org', password: 'S3cr3t-Pa55word!' };
  const out = redact('Invalid login for qa.person@example.org (S3cr3t-Pa55word!) or other@x.io', creds);
  assert.ok(!out.includes('example.org') && !out.includes('S3cr3t') && !out.includes('other@x.io'));
  assert.ok(redact('x'.repeat(500)).length <= 160);
});

test('report keeps KNOWN status, known ids and a redacted FAIL detail only', () => {
  const r = sanitize([
    { label: 'console_errors', status: 'KNOWN', reason: 'known_site_issue', known: ['csp_blocks_cloudflare_insights', 'Bad Id!'] },
    { label: 'auth_login', status: 'FAIL', reason: 'login_rejected', detail: 'Wrong password for a@b.co' },
    { label: 'catalog_ui', status: 'BLOCKED', reason: 'auth_only_route', detail: 'ignored' },
  ]);
  const c = l => r.cases.find(x => x.label === l);
  assert.equal(c('console_errors').status, 'KNOWN');
  assert.deepEqual(c('console_errors').known, ['csp_blocks_cloudflare_insights']);
  assert.equal(c('auth_login').detail, 'Wrong password for [email]');
  assert.equal(c('catalog_ui').reason, 'auth_only_route');
  assert.equal(c('catalog_ui').detail, undefined);
});

test('login spec targets the named submit button, not the first form button', () => {
  const spec = fs.readFileSync(new URL('./browser/login.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(spec, /'button\[type="submit"\], form button'/);
  assert.match(spec, /filter\(\{ hasText: SUBMIT \}\)/);
  assert.match(spec, /redact\(/);
});

test('all Playwright artifacts go under QA_OUTPUT_DIR, never /tmp/circle-qa-unused', () => {
  const cfg = fs.readFileSync(new URL('../playwright.config.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(cfg, /circle-qa-unused/);
  assert.match(cfg, /outputDir:path\.join\(outputDir\(\),'playwright-artifacts'\)/);
  assert.match(cfg, /trace:'off',screenshot:'off',video:'off'/);
});
