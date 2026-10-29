// Pure helpers for the authenticated login journey (unit-tested without a browser).
// Routes taken from the site's own router (2026-10-29): after sign-in the app does
// window.location.replace(redirect || '/dms') - a FULL navigation that must be allowed.
// '/' redirects to /dms. Catalog = /explore/shops (+ /explore/groups). Log out lives on /me.
export const HOME = '/dms';
export const CATALOG_PATHS = ['/explore/shops', '/explore/groups'];
export const ALLOWED_PATHS = ['/', '/login', HOME, '/explore', ...CATALOG_PATHS, '/me', '/sessions'];
// Routes the authenticated browse case must load (home + catalog browsing per QA_SCOPE.md).
export const BROWSE_PATHS = [HOME, ...CATALOG_PATHS, '/sessions'];
export const PAYMENT = /pay|checkout|billing|subscri|invoice|card|stripe|plan|upgrade|cart|orders|money/i;
// Third-party payment hosts: never contacted.
export const PAYMENT_HOSTS = /(^|\.)stripe\.(com|network)$/i;

// Should this request be aborted as payment-related? The PAYMENT pattern applies to
// page navigations and API calls only - NOT to same-origin static /assets/ bundles.
// Root cause of the 2026-10-29 17:09Z FAIL: /assets/cart-*.js (a core module imported
// by the entry bundle) matched /cart/, was aborted, and the SPA never mounted (#app empty).
export function isPaymentRequest(url, origin, isNavigation) {
  if (PAYMENT_HOSTS.test(url.hostname)) return true;
  if (url.origin === origin && url.pathname.startsWith('/assets/')) return false;
  return (isNavigation || url.pathname.startsWith('/api/')) && PAYMENT.test(url.pathname);
}

// Returns {email,password} or null. Never logs, never falls back to files or defaults.
export function loginEnv(env = process.env) {
  const email = env.CIRCLE_QA_EMAIL?.trim();
  const password = env.CIRCLE_QA_PASSWORD;
  return email && password ? { email, password } : null;
}

export function isAllowedNavigation(url, origin) {
  return url.origin === origin && ALLOWED_PATHS.includes(url.pathname.replace(/\/$/, '') || '/') && !PAYMENT.test(url.pathname);
}

// Accessible name of the real login submit button (observed: "Sign in").
export const SUBMIT = /^\s*(sign in|log ?in)\s*$/i;

// Inline error text for the report: credentials and any email address are removed,
// whitespace collapsed, length capped. Never returns the login values.
export function redact(text, creds = {}) {
  let out = String(text || '');
  for (const v of [creds?.email, creds?.password]) if (v) out = out.split(v).join('[redacted]');
  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').replace(/\s+/g, ' ').trim();
  return out.slice(0, 160);
}
