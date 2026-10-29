// Single source of truth for where run output (results, screenshots) is written.
// Output ALWAYS lives outside the repository: this repo is public and holds code only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolve symlinks on the deepest existing ancestor, then re-append the missing tail,
// so a symlink pointing into the checkout cannot smuggle output inside the repo.
function realResolve(p) {
  let head = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(head)) {
    const parent = path.dirname(head);
    if (parent === head) break;
    tail.unshift(path.basename(head));
    head = parent;
  }
  return path.join(fs.realpathSync(head), ...tail);
}

function isOutside(dir, root) {
  const rel = path.relative(root, dir);
  return path.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + path.sep);
}

export function outputDir(env = process.env) {
  const dir = path.resolve(env.QA_OUTPUT_DIR || path.join(os.tmpdir(), 'circle-qa-output'));
  const roots = [REPO_ROOT, fs.realpathSync(REPO_ROOT)];
  const candidates = [dir, realResolve(dir)];
  if (!candidates.every(c => roots.every(r => isOutside(c, r)))) {
    throw new Error('QA_OUTPUT_DIR must be outside the repository');
  }
  return dir;
}

export const resultsPath = (env = process.env) => path.join(outputDir(env), 'results.json');
export const screenshotsDir = (env = process.env) => path.join(outputDir(env), 'screenshots');
