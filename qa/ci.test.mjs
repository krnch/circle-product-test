import test from 'node:test';
import assert from 'node:assert/strict';
import { isCI } from './ci.mjs';

test('CI detection', () => {
  assert.equal(isCI({ CI: 'true' }), true);
  assert.equal(isCI({ GITHUB_ACTIONS: 'true' }), true);
  assert.equal(isCI({}), false);
});

test('public smoke skips screenshots in CI and has no gate/Actions coupling', async () => {
  const fs = await import('node:fs');
  const spec = fs.readFileSync(new URL('./browser/public.spec.mjs', import.meta.url), 'utf8');
  assert.match(spec, /if\(!isCI\(\)\) await capturePublic\(page,path\)/);
  assert.doesNotMatch(spec, /GITHUB_EVENT_NAME|login\.mjs|CIRCLE_QA_/);
});
