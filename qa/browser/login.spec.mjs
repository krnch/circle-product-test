// Authenticated journey with ONE pre-provisioned test account.
// The login comes ONLY from env CIRCLE_QA_EMAIL / CIRCLE_QA_PASSWORD at run time.
// Missing env => every case reports BLOCKED (missing_credentials), never FAIL.
// No screenshots, traces, cookies or credential values are ever written anywhere:
// this module does not import qa/screenshots.mjs and never logs the login.
//
// Site facts (from its own router bundle, 2026-10-29):
//  - Sign-in: POST /api/v1/auth/login, then window.location.replace(redirect || '/dms').
//    That full navigation to /dms must be allowed, or the page stays on /login with no
//    error (root cause of the 2026-10-29 auth_login FAIL: /dms was not allowlisted).
//  - Catalog = /explore/shops and /explore/groups (logged-in only).
//  - Log out = button "Log out" (data-testid me-logout) on /me.
import { test, expect } from '@playwright/test';
import { loginEnv, HOME, CATALOG_PATHS, BROWSE_PATHS, PAYMENT, isAllowedNavigation, redact, SUBMIT } from '../login.mjs';
import { gate } from '../guard.mjs';
import { isCI } from '../ci.mjs';

const origin = 'https://getcircle.chat';
const HYDRATION_TIMEOUT = 15000;
// Logged-in QA is VM-only: in CI the login is never even read from env.
const creds = isCI() ? null : loginEnv(process.env);
// Credentials alone never enable a live login: the fail-closed QA window must be open too.
const live = () => !isCI() && Boolean(creds) && gate(process.env).allowed;
const LOGOUT = /^\s*(log ?out|sign ?out)\s*$/i;

function emit(testInfo, payload) {
  return testInfo.attach('qa-case', { body: Buffer.from(JSON.stringify(payload)), contentType: 'application/json' });
}

// Default (not serial) mode with workers:1 runs tests in order on one shared page,
// but still enters dependent test bodies after an auth_login failure, so they can
// report BLOCKED login_failed instead of being silently skipped by Playwright.
test.describe.configure({ mode: 'default' });

let context, page;
const blockedNav = [];
let loggedIn = false;

test.beforeAll(async ({ browser }) => {
  if (!live()) return;
  context = await browser.newContext();
  page = await context.newPage();
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    // Re-check the window on every request; abort everything once it closes.
    if (!gate(process.env).allowed) return route.abort();
    // Hard-block payment/billing/cart/orders everywhere.
    if (PAYMENT.test(url.pathname)) return route.abort();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !isAllowedNavigation(url, origin)) {
      // Record (path only) so a blocked post-login redirect is visible in the report.
      blockedNav.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
});

test.afterAll(async () => { await context?.close(); });

async function blockedIfNoCreds(testInfo) {
  if (live()) return false;
  const reason = isCI() ? 'ci_not_allowed' : creds ? 'gate_closed' : 'missing_credentials';
  await emit(testInfo, { status: 'BLOCKED', reason });
  test.skip(true, reason);
  return true;
}

async function blockedIfNotLoggedIn(testInfo) {
  if (await blockedIfNoCreds(testInfo)) return true;
  if (loggedIn) return false;
  await emit(testInfo, { status: 'BLOCKED', reason: 'login_failed' });
  test.skip(true, 'login_failed');
  return true;
}

// Positive authenticated-state marker: the app shell rendered on a logged-in route
// (not /login), with no password field. The guard sends anonymous users to /login.
async function expectAuthenticated() {
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: HYDRATION_TIMEOUT });
  await expect(page.locator('a[href="/me"]').first()).toBeVisible({ timeout: HYDRATION_TIMEOUT });
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
}

test('auth_login', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  // The real submit is <button type=submit>"Sign in"</button>; the first in-form
  // button is an unnamed type=button (password toggle). Target the submit by name.
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST', { timeout: HYDRATION_TIMEOUT }).catch(() => null);
  await page.locator('form button[type="submit"]').filter({ hasText: SUBMIT }).first().click();
  const res = await loginResponse;
  const apiStatus = res ? res.status() : 0;
  const left = await page.waitForURL(u => new URL(u).pathname !== '/login', { timeout: HYDRATION_TIMEOUT }).then(() => true).catch(() => false);
  if (!left) {
    // Explain the FAIL without credentials: API status, inline error banner, blocked redirect.
    const banner = await page.locator('.error-banner, [role="alert"]').allInnerTexts().catch(() => []);
    const parts = [`api=${apiStatus || 'none'}`];
    if (banner.length) parts.push(`error=${banner.join(' | ')}`);
    if (blockedNav.length) parts.push(`blocked_nav=${[...new Set(blockedNav)].join(',')}`);
    const reason = apiStatus >= 400 || banner.length ? 'login_rejected' : blockedNav.length ? 'redirect_blocked' : 'no_error_shown';
    await emit(testInfo, { status: 'FAIL', reason, detail: redact(parts.join(' '), creds) });
    // Clear the form so Playwright's failure context never holds the login values.
    await page.locator('input[type="email"]').fill('').catch(() => {});
    await page.locator('input[type="password"]').fill('').catch(() => {});
  }
  expect(left, 'still on /login after submit').toBe(true);
  await expectAuthenticated();
  loggedIn = true;
});

test('auth_browse', async ({}, testInfo) => {
  if (await blockedIfNotLoggedIn(testInfo)) return;
  // Every intended route must load successfully AND show authenticated content.
  for (const path of BROWSE_PATHS) {
    const res = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    expect(res, `no response for ${path}`).not.toBeNull();
    expect(res.ok(), `HTTP ${res.status()} for ${path}`).toBe(true);
    await expectAuthenticated();
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
  }
});

test('catalog_ui', async ({}, testInfo) => {
  if (await blockedIfNotLoggedIn(testInfo)) return;
  // Logged-in catalog: Explore -> Shops via the app's own nav link (in-app routing).
  await page.goto(origin + HOME, { waitUntil: 'domcontentloaded' });
  await expectAuthenticated();
  await page.locator(`a[href="${CATALOG_PATHS[0]}"]`).first().click();
  await expect(page).toHaveURL(/\/explore\/shops$/, { timeout: HYDRATION_TIMEOUT });
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(page.getByText(/\b404\b|not found|page doesn.t exist/i)).toHaveCount(0);
});

test('auth_reload', async ({}, testInfo) => {
  if (await blockedIfNotLoggedIn(testInfo)) return;
  // Reload a PROTECTED route; the session must survive with a positive auth marker.
  await page.goto(origin + HOME, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectAuthenticated();
  await expect(page).toHaveURL(/\/dms$/);
});

test('auth_logout', async ({}, testInfo) => {
  if (await blockedIfNotLoggedIn(testInfo)) return;
  await page.goto(origin + '/me', { waitUntil: 'domcontentloaded' });
  const control = page.locator('[data-testid="me-logout"]')
    .or(page.getByRole('button', { name: LOGOUT })).first();
  await expect(control).toBeVisible({ timeout: HYDRATION_TIMEOUT });
  await control.click();
  await expect(page).toHaveURL(/\/login/, { timeout: HYDRATION_TIMEOUT });
  // After logout, a protected page must lead back to the login form.
  await page.goto(origin + HOME, { waitUntil: 'domcontentloaded' }).catch(() => null);
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: HYDRATION_TIMEOUT });
});
