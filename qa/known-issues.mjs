// Known Circle-side issues: real product findings that are already reported.
// They are NOT whitelisted away: every run still detects them and records them
// as KNOWN (with the issue id) in the report. Only NEW errors fail the case.
// Remove an entry once Circle fixes it; the case then reverts to plain PASS/FAIL.
export const KNOWN_ISSUES = [
  {
    id: 'csp_blocks_cloudflare_insights',
    since: '2026-10-29',
    // Site CSP script-src ('self' js.stripe.com) refuses the Cloudflare Web Analytics beacon.
    match: /Refused to load the script 'https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js[^']*' because it violates the following Content Security Policy directive/,
  },
];

// Split console errors into known (by issue id) and new.
export function triageErrors(errors = [], known = KNOWN_ISSUES) {
  const knownIds = new Set();
  const fresh = [];
  for (const e of errors) {
    const hit = known.find(k => k.match.test(e));
    if (hit) knownIds.add(hit.id); else fresh.push(e);
  }
  return { known: [...knownIds], fresh };
}
