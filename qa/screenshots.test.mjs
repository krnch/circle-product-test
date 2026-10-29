import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PUBLIC_ALLOWLIST, PUBLISH_DIR, PRIVATE_DIR, slug, publishablePath, isPublishable, listPublished } from './screenshots.mjs';

test('every allowlisted public route has a deterministic publishable filename', () => {
  const names = PUBLIC_ALLOWLIST.map(r => publishablePath(r, 'public'));
  assert.equal(new Set(names).size, PUBLIC_ALLOWLIST.length);
  assert.equal(slug('/'), 'root');
  assert.equal(publishablePath('/login', 'public'), path.join(PUBLISH_DIR, 'login.png'));
  for (const n of names) assert.ok(n.startsWith(PUBLISH_DIR + '/') && n.endsWith('.png'));
});

test('authenticated or raw contexts can never produce a publishable path', () => {
  for (const ctx of ['authenticated', 'raw', 'session', '', undefined, null, 'Public']) {
    assert.throws(() => publishablePath('/login', ctx), /refusing publishable screenshot/);
    assert.equal(isPublishable('/login', ctx), false);
  }
  assert.equal(isPublishable('/login', 'public'), true);
});

test('non-allowlisted routes are rejected even in a public context', () => {
  for (const r of ['/dashboard', '/account', '/checkout', '/login?next=x', '../../etc/passwd']) {
    assert.throws(() => publishablePath(r, 'public'));
  }
});

test('private evidence directory is distinct from the publishable one and gitignored', () => {
  assert.notEqual(PRIVATE_DIR, PUBLISH_DIR);
  assert.ok(!PRIVATE_DIR.startsWith('qa-output'));
  const ignore = fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^raw-evidence\/$/m);
});

test('signup spec never imports the screenshot module', () => {
  const spec = fs.readFileSync(new URL('./browser/signup.spec.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  // One-account policy: validation only, never submits or creates an account.
  assert.doesNotMatch(spec, /\.click\(|press\(|\.submit\(|requestSubmit|identity\.mjs|CIRCLE_QA_|password\.fill\('[^']/);
  assert.match(spec, /req\.method\(\) !== 'GET'/);
  assert.doesNotMatch(spec, /^import .*screenshots\.mjs/m);
  assert.doesNotMatch(spec, /from '\.\.\/screenshots\.mjs'/);
  assert.doesNotMatch(spec, /page\.screenshot/);
});

test('public spec captures a screenshot on every allowlisted visit', () => {
  const spec = fs.readFileSync(new URL('./browser/public.spec.mjs', import.meta.url), 'utf8');
  assert.match(spec, /capturePublic\(page,\s*path\)/);
});

test('listPublished only returns png files under the publish dir', () => {
  const cwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-shot-'));
  try {
    process.chdir(tmp);
    process.env.QA_OUTPUT_DIR = path.join(tmp, 'out');
    const dir = path.join(tmp, 'out', 'screenshots');
    assert.deepEqual(listPublished(), []);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'login.png'), 'x');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    assert.deepEqual(listPublished(), [path.join(dir, 'login.png')]);
  } finally { delete process.env.QA_OUTPUT_DIR; process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
});
