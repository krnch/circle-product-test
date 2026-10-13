// Automated secret / PII gate. Runs BEFORE anything is published.
// Scans the sanitized report JSON plus every screenshot (filename AND raw bytes, so
// text rendered into a PNG stream or embedded metadata is still caught).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { listPublished } from './screenshots.mjs';

export const RULES = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g],
  ['bearer_token', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/gi],
  ['github_token', /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['generic_api_key', /\b(?:sk|pk|rk|api[_-]?key|secret|token)[_-]?(?:live|test)?[_:=\s"']{1,3}[A-Za-z0-9_-]{20,}/gi],
  ['aws_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['cookie', /\b(?:Set-Cookie|session[_-]?id|sessionid|connect\.sid|csrftoken|PHPSESSID|JSESSIONID)\b\s*[:=]/gi],
  ['password', /\b(?:password|passwd|pwd|passphrase)\b\s*[:=]\s*\S+/gi],
  ['card_number', /\b(?:\d[ -]?){13,19}\b/g],
];

function luhn(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function keep(rule, match) {
  if (rule === 'card_number') {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  }
  return true;
}

export function scanText(text, source) {
  const findings = [];
  for (const [rule, re] of RULES) {
    for (const m of String(text).matchAll(new RegExp(re.source, re.flags))) {
      if (keep(rule, m[0])) findings.push({ source, rule, offset: m.index ?? 0 });
    }
  }
  return findings;
}

export function scanPaths(paths) {
  const findings = [];
  for (const p of paths) {
    findings.push(...scanText(p, `path:${p}`));
    if (!fs.existsSync(p)) continue;
    // latin1 keeps byte-for-byte fidelity for binary PNGs.
    findings.push(...scanText(fs.readFileSync(p, 'latin1'), p));
  }
  return findings;
}

export function scanPublishSet({ report = 'qa-output/results.json', screenshots = listPublished() } = {}) {
  const findings = scanPaths([report, ...screenshots]);
  return { ok: findings.length === 0, count: findings.length, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = scanPublishSet();
  // Report rule + location only; never echo the matched value.
  for (const f of result.findings) console.error(`SECRET_SCAN ${f.rule} in ${f.source} @${f.offset}`);
  console.log(`SECRET_SCAN ${result.ok ? 'CLEAN' : 'FAILED'} (${result.count} finding(s))`);
  process.exit(result.ok ? 0 : 1);
}
