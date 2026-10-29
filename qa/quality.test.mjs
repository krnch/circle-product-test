import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { realConsoleErrors, checkTiming, a11yIssues, PERF_BUDGET_MS } from './quality.mjs';
import { sanitize } from './report.mjs';

test('console filter drops only failures of requests we blocked; real 404/500 stay', () => {
  const blocked = ['https://evil.example/x.js'];
  assert.deepEqual(realConsoleErrors([
    'Failed to load resource: net::ERR_FAILED https://evil.example/x.js',
    'Failed to load resource: the server responded with a status of 404 ()',
    'Failed to load resource: net::ERR_FAILED https://getcircle.chat/app.js',
    'TypeError: x is undefined', 42,
  ], blocked), [
    'Failed to load resource: the server responded with a status of 404 ()',
    'Failed to load resource: net::ERR_FAILED https://getcircle.chat/app.js',
    'TypeError: x is undefined',
  ]);
});

test('timing check uses navigation entry relative to startTime and fails closed', () => {
  assert.deepEqual(checkTiming({ startTime: 0, domContentLoadedEventEnd: 800.4, loadEventEnd: 1500 }), { ok: true, domContentLoaded: 800, load: 1500 });
  assert.equal(checkTiming({ startTime: 0, domContentLoadedEventEnd: PERF_BUDGET_MS.domContentLoaded + 1, loadEventEnd: 1 }).ok, false);
  assert.equal(checkTiming(null).ok, false);
  assert.equal(checkTiming({ startTime: 0 }).reason, 'no_timing');
});

test('a11y basics: lang, title, labelled inputs, img alt', () => {
  assert.deepEqual(a11yIssues({ lang: 'en', title: 'Circle', inputs: [{ type: 'email', labelled: true }, { type: 'hidden', labelled: false }], images: [{ alt: '' }] }), []);
  assert.deepEqual(a11yIssues({ lang: '', title: ' ', inputs: [{ type: 'password', labelled: false }], images: [{ alt: null }] }).sort(),
    ['html_lang_missing', 'img_alt_missing', 'title_missing', 'unlabelled_input_password']);
});

test('quality cases are reported with fixed labels; console check is VM-only in CI', () => {
  const r = sanitize([{ label: 'console_errors', status: 'BLOCKED', reason: 'vm_only' }, { label: 'perf_timings', status: 'PASS' }]);
  assert.equal(r.cases.find(c => c.label === 'console_errors').reason, 'vm_only');
  assert.equal(r.cases.find(c => c.label === 'perf_timings').status, 'PASS');
  const spec = fs.readFileSync(new URL('./browser/quality.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(spec, /if \(isCI\(\)\)/);
  assert.match(spec, /req\.method\(\) === 'GET'/);
  assert.match(spec, /routeWebSocket\(/);
  assert.doesNotMatch(spec, /screenshot|CIRCLE_QA_|login\.mjs/);
});
