// Single source of truth for where run output (results, screenshots) is written.
// Output ALWAYS lives outside the repository: this repo is public and holds code only.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function outputDir(env = process.env) {
  const dir = path.resolve(env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'circle-qa-output'));
  const rel = path.relative(REPO_ROOT, dir);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error('QA_OUTPUT_DIR must be outside the repository');
  }
  return dir;
}

export const resultsPath = (env = process.env) => path.join(outputDir(env), 'results.json');
export const screenshotsDir = (env = process.env) => path.join(outputDir(env), 'screenshots');
