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

test('navigation allowlist blocks payment, foreign origins and unknown paths', () => {
  assert.equal(isAllowedNavigation(new URL(origin + '/dashboard'), origin), true);
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
});

test('QA_OUTPUT_DIR must be outside the repo', () => {
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('../qa-output', import.meta.url).pathname }));
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('..', import.meta.url).pathname }));
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('../..evidence', import.meta.url).pathname }));
  assert.throws(() => outputDir({ QA_OUTPUT_DIR: new URL('../qa/..x', import.meta.url).pathname }));
  const tmp = path.join(os.tmpdir(), 'cqa-out');
  assert.equal(outputDir({ QA_OUTPUT_DIR: tmp }), tmp);
  assert.ok(!outputDir({}).startsWith(new URL('..', import.meta.url).pathname));
});

test('.gitignore excludes output, reports, screenshots and env files', () => {
  const ignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  for (const p of ['qa-output/', 'reports/', '*.png', '.env*', 'test-results/', 'playwright-report/']) {
    assert.ok(ignore.split('\n').includes(p), p);
  }
});
