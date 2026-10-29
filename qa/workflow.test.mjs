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

test('only ci.yml exists; the old publishing workflow and Squad automation are gone', () => {
  assert.deepEqual(readdirSync(dir).filter(f => /\.ya?ml$/.test(f)), ['ci.yml']);
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
  assert.match(smoke, /playwright test qa\/browser\/public\.spec\.mjs qa\/browser\/signup\.spec\.mjs/);
  assert.doesNotMatch(ci, /login\.spec/);
  assert.doesNotMatch(smoke, /npm run qa/);
  assert.match(smoke, /CI: 'true'/);
  assert.match(smoke, /QA_OUTPUT_DIR: \$\{\{ runner\.temp \}\}/);
  // runner.* is not available in job-level env (invalid workflow); only in step env.
  assert.doesNotMatch(smoke.split('steps:')[0], /runner\./);
  assert.match(smoke, /node qa\/report\.mjs --summary --ci/);
});
