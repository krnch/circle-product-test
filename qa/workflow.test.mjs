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
  assert.match(browser, /^    timeout-minutes: 15$/m);
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

test('no push trigger: the workflow cannot be retriggered by its own qa-results commits', () => {
  const triggers = workflow.match(/^on:\n([\s\S]*?)^permissions:/m)[1];
  assert.doesNotMatch(triggers, /^\s+push:/m);
  assert.doesNotMatch(triggers, /^\s+(push|create|repository_dispatch):/m);
  assert.match(triggers, /workflow_dispatch:/);
  assert.match(triggers, /schedule:/);
  assert.match(workflow, /\[skip ci\]/);
});

test('publish is write-scoped, concurrency-guarded and gated behind the secret scan', () => {
  const browser = job('browser');
  assert.match(browser, /^    permissions:\n      contents: write$/m);
  assert.match(browser, /^    concurrency:\n      group: circle-public-qa-publish\n      cancel-in-progress: false$/m);
  const scanAt = browser.indexOf('run: node qa/scan.mjs');
  const publishAt = browser.indexOf('run: bash qa/publish.sh');
  assert.ok(scanAt > -1 && publishAt > scanAt, 'secret scan must precede publish');
  assert.match(browser, /QA_STAMP: \$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  assert.match(browser, /QA_RETENTION: '14'/);
  assert.ok(!/branch: *main|refs\/heads\/main/.test(browser), 'must not publish to default branch');
  // Secrets are injected as env, never literals.
  for (const key of ['QA_EMAIL_BASE', 'QA_EMAIL_DOMAIN', 'QA_USER_1_PASSWORD', 'QA_USER_4_PASSWORD']) {
    assert.ok(browser.includes(`${key}: \${{ secrets.${key} }}`), key);
  }
});

test('publish script targets qa-results only, force-rewrites history and applies retention', () => {
  const sh = readFileSync(new URL('./publish.sh', import.meta.url), 'utf8');
  assert.match(sh, /BRANCH="qa-results"/);
  assert.match(sh, /node qa\/scan\.mjs/);
  assert.match(sh, /\[skip ci\]/);
  assert.match(sh, /head -n -"\$RETENTION"/);
  assert.match(sh, /push --force .* "\$BRANCH"/);
  assert.doesNotMatch(sh, /push .*\bmain\b/);
});
