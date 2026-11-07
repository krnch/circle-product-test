import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const dir = new URL('../.github/workflows/', import.meta.url);
const ci = readFileSync(new URL('ci.yml', dir), 'utf8').replace(/^\s*#.*$/gm, '');
function job(name) {
  const body = ci.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:|$(?![\\s\\S]))`, 'm'))?.[1];
  assert.ok(body, `missing ${name} job`);
  return body;
}

test('only ci.yml and qa-scheduled.yml exist; the old publish script is gone', () => {
  assert.deepEqual(readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort(), ['ci.yml', 'qa-scheduled.yml']);
  assert.equal(existsSync(new URL('../qa/publish.sh', import.meta.url)), false);
});

test('ci.yml triggers only on pull_request and push to main', () => {
  const triggers = ci.match(/^on:\n([\s\S]*?)^permissions:/m)[1];
  assert.match(triggers, /^  pull_request:$/m);
  assert.match(triggers, /^  push:\n    branches: \[main\]$/m);
  assert.doesNotMatch(triggers, /schedule|workflow_dispatch|pull_request_target|issues|issue_comment|repository_dispatch/);
});

test('read-only, no secrets, no artifacts, no publishing, pinned actions only', () => {
  assert.match(ci, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(ci, /secrets\.|vars\.|contents: write|upload-artifact|publish|qa-results|git push|GITHUB_TOKEN|CIRCLE_QA_|QA_ENABLED/);
  for (const use of ci.matchAll(/uses: ([^\n]+)/g)) assert.match(use[1], /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  assert.equal((ci.match(/persist-credentials: false/g) || []).length, 2);
});

test('unit job runs npm test and syntax checks', () => {
  const unit = job('unit');
  assert.match(unit, /run: npm test/);
  assert.match(unit, /node --check/);
});

test('public smoke runs only logged-out specs, never login.spec, output outside checkout', () => {
  const smoke = job('public-smoke');
  assert.match(smoke, /playwright test qa\/browser\/public\.spec\.mjs qa\/browser\/signup\.spec\.mjs qa\/browser\/quality\.spec\.mjs /);
  assert.doesNotMatch(ci, /login\.spec/);
  assert.doesNotMatch(smoke, /npm run qa/);
  assert.match(smoke, /CI: 'true'/);
  assert.match(smoke, /QA_OUTPUT_DIR: \$\{\{ runner\.temp \}\}/);
  // runner.* is not available in job-level env (invalid workflow); only in step env.
  assert.doesNotMatch(smoke.split('steps:')[0], /runner\./);
  assert.match(smoke, /node qa\/report\.mjs --summary --ci/);
});

const qa = readFileSync(new URL('qa-scheduled.yml', dir), 'utf8').replace(/^\s*#.*$/gm, '');
test('qa-scheduled: schedule + dispatch only, gated, no artifacts, pinned actions', () => {
  const triggers = qa.match(/^on:\n([\s\S]*?)^permissions:/m)[1];
  assert.match(triggers, /schedule:/);
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /pull_request|push:|issue|repository_dispatch/);
  assert.match(qa, /^permissions:\n  contents: read\n/m);
  assert.equal((qa.match(/contents: write/g) || []).length, 1, 'write only in report job');
  assert.doesNotMatch(qa, /upload-artifact|screenshot|trace|storageState/i);
  assert.match(qa, /vars\.QA_ENABLED == 'true'/);
  for (const use of qa.matchAll(/uses: ([^\n]+)/g)) assert.match(use[1], /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  for (const m of qa.matchAll(/persist-credentials: (\w+)/g)) assert.equal(m[1], 'false');
});
test('qa-scheduled: secrets only via env, secret guard steps present, no echo of secrets', () => {
  assert.match(qa, /CIRCLE_QA_EMAIL: \$\{\{ secrets\.QA_LOGIN_EMAIL \}\}/);
  assert.equal((qa.match(/name: Secret guard/g) || []).length, 2);
  assert.doesNotMatch(qa, /echo[^\n]*(secrets\.|CIRCLE_QA_|\$S1|\$S2)/);
  assert.match(qa, /qa-results/);
  assert.match(qa, /workers|login\.spec\.mjs/);
});
