import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/public-qa.yml', import.meta.url), 'utf8');
// Inspect this small dependency-free workflow without installing a YAML parser.
function job(name) {
  const body = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:|$(?![\\s\\S]))`, 'm'))?.[1];
  assert.ok(body, `missing separate ${name} job`);
  return body;
}

test('browser job only runs on manual dispatch from the default branch', () => {
  const browser = job('browser');
  const expression = browser.match(/^    if: \$\{\{ (.*) \}\}$/m)?.[1];
  assert.equal(expression, "github.event_name == 'workflow_dispatch' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
  const allowed = new Function('github', 'format', `return ${expression};`);
  for (const defaultBranch of ['main', 'release/stable']) {
    for (const event of ['pull_request', 'pull_request_target', 'push', 'schedule', 'workflow_dispatch']) {
      for (const ref of [`refs/heads/${defaultBranch}`, 'refs/heads/untrusted', 'refs/pull/1/merge']) {
        assert.equal(allowed({ event_name: event, ref, event: { repository: { default_branch: defaultBranch } } }, (t, v) => t.replace('{0}', v)),
          event === 'workflow_dispatch' && ref === `refs/heads/${defaultBranch}`, `${event} ${ref}`);
      }
    }
  }
});

test('PR job only performs unit and syntax checks', () => {
  const unit = job('unit');
  assert.match(unit, /run: npm test/);
  assert.match(unit, /node --check/);
  assert.doesNotMatch(unit, /vars\.|secrets\.|npm ci|npm run qa|npx|upload-artifact/);
});

test('no trigger can start the workflow on its own (no push, no schedule)', () => {
  const triggers = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)[1];
  assert.doesNotMatch(triggers, /^\s+(push|schedule|create|repository_dispatch|issues|issue_comment):/m);
});

test('nothing is published: read-only, no publish step, no artifacts, no step summary, no secrets', () => {
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(workflow, /contents: write|publish\.sh|qa-results|upload-artifact|GITHUB_STEP_SUMMARY|GITHUB_TOKEN|secrets\./);
  assert.equal(existsSync(new URL('./publish.sh', import.meta.url)), false, 'publish script must not exist');
  for (const use of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(use[1], /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2);
});

test('browser job keeps the fail-closed gate and writes output outside the checkout', () => {
  const browser = job('browser');
  assert.match(browser, /gate\(process\.env\)\.allowed/);
  for (const command of ['npm ci --ignore-scripts --no-audit --no-fund', 'npx --no-install playwright install --with-deps chromium', 'npm run qa']) {
    assert.ok(browser.includes(`if: steps.gate.outputs.enabled == 'true'\n        run: ${command}`), `${command} must remain gated`);
  }
  assert.match(browser, /QA_OUTPUT_DIR: \$\{\{ runner\.temp \}\}/);
});

test('no Squad automation workflows (triage, issue-assign, heartbeat, release) are present', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  for (const f of ['squad-triage.yml', 'squad-issue-assign.yml', 'squad-heartbeat.yml', 'squad-release.yml', 'sync-squad-labels.yml']) {
    assert.equal(existsSync(new URL(f, dir)), false, f);
  }
});
