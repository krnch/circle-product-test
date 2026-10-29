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
