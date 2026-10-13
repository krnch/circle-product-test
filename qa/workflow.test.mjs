import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/public-qa.yml', import.meta.url), 'utf8');
// Inspect this small dependency-free workflow without installing a YAML parser.
function job(name) {
  const body = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:|$(?![\\s\\S]))`, 'm'))?.[1];
  assert.ok(body, `missing separate ${name} job`);
  return body;
}

test('browser job trust boundary rejects every PR and non-default branch dispatch', () => {
  const browser = job('browser');
  const expression = browser.match(/^    if: \$\{\{ (.*) \}\}$/m)?.[1];
  assert.equal(expression, "(github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
  // Evaluate the actual constrained expression for both conventional and renamed default branches.
  const allowed = new Function('github', 'format', `return ${expression};`);
  for (const defaultBranch of ['main', 'release/stable']) {
    for (const event of ['pull_request', 'pull_request_target', 'push', 'schedule', 'workflow_dispatch']) {
      for (const ref of [`refs/heads/${defaultBranch}`, 'refs/heads/untrusted', 'refs/pull/1/merge', 'refs/tags/main']) {
        assert.equal(allowed({ event_name: event, ref, event: { repository: { default_branch: defaultBranch } } }, (template, value) => template.replace('{0}', value)),
          ['schedule', 'workflow_dispatch'].includes(event) && ref === `refs/heads/${defaultBranch}`, `${event} ${ref}`);
      }
    }
  }
});

test('PR job only performs unit and syntax checks, without vars or browser/install/artifact steps', () => {
  const unit = job('unit');
  assert.match(unit, /^    if: \$\{\{ github.event_name == 'pull_request' \}\}$/m);
  assert.match(unit, /run: npm test/);
  assert.match(unit, /node --check/);
  assert.doesNotMatch(unit, /vars\.|QA_ENABLED|npm ci|npm run qa|npx|upload-artifact|run: node qa\/report/);
});

test('trusted browser retains fail-closed gate and bounded read-only sanitized artifacts', () => {
  const browser = job('browser');
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.match(browser, /^    timeout-minutes: 10$/m);
  for (const variable of ['QA_ENABLED', 'QA_STARTED_AT', 'QA_EXPIRES_AT']) {
    assert.ok(browser.includes(`${variable}: \${{ vars.${variable} }}`));
  }
  assert.match(browser, /gate\(process\.env\)\.allowed/);
  for (const command of ['npm ci --ignore-scripts --no-audit --no-fund', 'npx --no-install playwright install --with-deps chromium', 'npm run qa']) {
    assert.ok(browser.includes(`if: steps.gate.outputs.enabled == 'true'\n        run: ${command}`), `${command} must remain gated`);
  }
  assert.match(browser, /path: qa-output\/results\.json\n          retention-days: 1\n          if-no-files-found: error/);
  for (const use of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(use[1], /^actions\/[\w-]+@[a-f0-9]{40}$/);
  assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2);
});
