// Markdown PASS/FAIL/BLOCKED rows from the sanitized results JSON (fixed labels,
// allowlisted reasons, redacted FAIL detail only). Never reads env secrets.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resultsPath } from './output.mjs';
import { sanitize } from './report.mjs';

export const AUTH = ['auth_login','auth_browse','catalog_ui','auth_reload','auth_logout'];

export function rows(cases, scope) {
  // catalog_ui exists in both runs (logged-out page vs logged-in catalog); each job has its own results file.
  const pick = cases.filter(c => scope === 'auth' ? AUTH.includes(c.label) : c.label === 'catalog_ui' || !AUTH.includes(c.label));
  return pick.map(c => {
    const status = c.status === 'NOT_RUN' ? 'BLOCKED' : c.status;
    const note = [c.reason || (c.status === 'NOT_RUN' ? 'not_run' : ''), c.known?.length ? `known: ${c.known.join(',')}` : '', c.detail || ''].filter(Boolean).join('; ').replace(/\|/g, '/');
    return `| ${scope} | ${c.label} | ${status} | ${note} |`;
  });
}

export function load(file = resultsPath()) {
  const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).cases : [];
  return sanitize(raw).cases;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = process.argv[2] === 'auth' ? 'auth' : 'public';
  process.stdout.write(rows(load(), scope).join('\n') + '\n');
}
