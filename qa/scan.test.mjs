import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanText, scanPaths, scanPublishSet } from './scan.mjs';

const rules = s => [...new Set(s.map(f => f.rule))].sort();

test('detects every required secret and PII class', () => {
  assert.ok(rules(scanText('contact qa-user@example.com now', 'x')).includes('email'));
  assert.ok(rules(scanText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdEFGH', 'x')).includes('jwt'));
  assert.ok(rules(scanText('Authorization: Bearer abcdefghijklmnopqrstuvwx', 'x')).includes('bearer_token'));
  assert.ok(rules(scanText('ghp_' + 'a'.repeat(36), 'x')).includes('github_token'));
  assert.ok(rules(scanText('AKIAIOSFODNN7EXAMPLE', 'x')).includes('aws_key'));
  assert.ok(rules(scanText('Set-Cookie: a=b', 'x')).includes('cookie'));
  assert.ok(rules(scanText('sessionid=abc', 'x')).includes('cookie'));
  assert.ok(rules(scanText('password: hunter2hunter2', 'x')).includes('password'));
  assert.ok(rules(scanText('4242424242424242', 'x')).includes('card_number'));
  assert.ok(rules(scanText('4111 1111 1111 1111', 'x')).includes('card_number'));
  assert.ok(rules(scanText('-----BEGIN RSA PRIVATE KEY-----', 'x')).includes('private_key'));
});

test('non-luhn long digit strings are not flagged as cards', () => {
  assert.equal(scanText('1234567890123456', 'x').filter(f => f.rule === 'card_number').length, 0);
});

test('a clean sanitized report passes and findings never echo the matched value', () => {
  const clean = JSON.stringify({ schema: 2, cases: [{ label: 'login_ui', route: '/login', status: 'PASS' }], accounts: [{ index: 0, local_part: 'circle-qa-synthetic-abc-1', synthetic: true }] });
  assert.deepEqual(scanText(clean, 'report'), []);
  const dirty = scanText('user@example.com', 'report');
  assert.equal(JSON.stringify(dirty).includes('user@example.com'), false);
});

test('scans screenshot file paths as well as their bytes', () => {
  const cwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-scan-'));
  try {
    process.chdir(tmp);
    process.env.QA_OUTPUT_DIR = path.join(tmp, 'qa-output');
    fs.mkdirSync('qa-output/screenshots', { recursive: true });
    fs.writeFileSync('qa-output/results.json', '{"schema":2,"cases":[]}');
    fs.writeFileSync('qa-output/screenshots/login.png', Buffer.from('\x89PNG\r\n clean bytes'));
    assert.equal(scanPublishSet().ok, true);

    // Secret embedded in PNG bytes must be caught.
    fs.writeFileSync('qa-output/screenshots/register.png', Buffer.from('\x89PNG leaked qa-user@example.com'));
    let r = scanPublishSet();
    assert.equal(r.ok, false);
    assert.ok(r.findings.some(f => f.rule === 'email' && f.source.endsWith('register.png')));

    // Secret embedded in the filename must be caught too.
    fs.rmSync('qa-output/screenshots/register.png');
    assert.equal(scanPublishSet().ok, true);
    assert.equal(scanPaths(['qa-output/screenshots/ghp_' + 'b'.repeat(36) + '.png']).length > 0, true);
  } finally { delete process.env.QA_OUTPUT_DIR; process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
});
