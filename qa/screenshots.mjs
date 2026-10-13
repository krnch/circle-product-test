// Publishable-screenshot boundary. Enforced in code, not only in docs.
//
// RULE: a screenshot may only enter the publishable directory (qa-output/screenshots)
// when it was taken from an UNAUTHENTICATED browser context on an allowlisted public
// page. Authenticated / raw-session screenshots are refused here and have no code path
// into any published artifact. qa/identity.mjs never imports this module.
import fs from 'node:fs';
import path from 'node:path';

export const PUBLIC_ALLOWLIST = ['/', '/login', '/register', '/catalog', '/products'];
export const PUBLISH_DIR = 'qa-output/screenshots';
// Raw/authenticated evidence, if ever captured, goes here. .gitignore excludes it and
// the publish job never reads it.
export const PRIVATE_DIR = 'raw-evidence';

export function slug(route) {
  if (!PUBLIC_ALLOWLIST.includes(route)) throw new Error(`screenshot route not allowlisted: ${route}`);
  return route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

// Returns the publishable path, or throws. `context` must be the literal 'public'.
export function publishablePath(route, context) {
  if (context !== 'public') throw new Error(`refusing publishable screenshot for context=${context}: only unauthenticated public captures may be published`);
  return path.join(PUBLISH_DIR, `${slug(route)}.png`);
}

export function isPublishable(route, context) {
  try { publishablePath(route, context); return true; } catch { return false; }
}

// page: Playwright Page. Captures full-page PNG only for public, allowlisted routes.
export async function capturePublic(page, route) {
  const file = publishablePath(route, 'public');
  const cookies = await page.context().cookies();
  // Defence in depth: a session cookie means the context is no longer unauthenticated.
  if (cookies.some(c => /sess|auth|token|jwt|sid/i.test(c.name))) {
    throw new Error('refusing capture: browser context carries a session cookie');
  }
  fs.mkdirSync(PUBLISH_DIR, { recursive: true });
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
  return file;
}

export function listPublished() {
  if (!fs.existsSync(PUBLISH_DIR)) return [];
  return fs.readdirSync(PUBLISH_DIR).filter(f => f.endsWith('.png')).sort().map(f => path.join(PUBLISH_DIR, f));
}
