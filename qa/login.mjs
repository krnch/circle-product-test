// Pure helpers for the authenticated login journey (unit-tested without a browser).
export const ALLOWED_PATHS = ['/', '/login', '/catalog', '/products', '/dashboard', '/home', '/app', '/account', '/logout'];
// Routes the authenticated browse case must load (catalog/product browsing per QA_SCOPE.md).
export const BROWSE_PATHS = ['/', '/catalog', '/products'];
export const PAYMENT = /pay|checkout|billing|subscri|invoice|card|stripe|plan|upgrade/i;

// Returns {email,password} or null. Never logs, never falls back to files or defaults.
export function loginEnv(env = process.env) {
  const email = env.CIRCLE_QA_EMAIL?.trim();
  const password = env.CIRCLE_QA_PASSWORD;
  return email && password ? { email, password } : null;
}

export function isAllowedNavigation(url, origin) {
  return url.origin === origin && ALLOWED_PATHS.includes(url.pathname) && !PAYMENT.test(url.pathname);
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
