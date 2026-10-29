// Authenticated journey with ONE pre-provisioned test account.
// The login comes ONLY from env CIRCLE_QA_EMAIL / CIRCLE_QA_PASSWORD at run time.
// Missing env => every case reports BLOCKED (missing_credentials), never FAIL.
// No screenshots, traces, cookies or credential values are ever written anywhere:
// this module does not import qa/screenshots.mjs and never logs the login.
import { test, expect } from '@playwright/test';
import { loginEnv, BROWSE_PATHS, PAYMENT, isAllowedNavigation } from '../login.mjs';
import { gate } from '../guard.mjs';

const origin = 'https://getcircle.chat';
const HYDRATION_TIMEOUT = 15000;
const creds = loginEnv(process.env);
// Credentials alone never enable a live login: the fail-closed QA window must be open too.
const live = () => Boolean(creds) && gate(process.env).allowed;
const LOGOUT = /log ?out|sign ?out/i;

function emit(testInfo, payload) {
  return testInfo.attach('qa-case', { body: Buffer.from(JSON.stringify(payload)), contentType: 'application/json' });
}

test.describe.configure({ mode: 'serial' });

let context, page;
const consoleErrors = [];

test.beforeAll(async ({ browser }) => {
  if (!live()) return;
  context = await browser.newContext();
  page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(1); });
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    // Re-check the window on every request; abort everything once it closes.
    if (!gate(process.env).allowed) return route.abort();
    // Hard-block payment/billing everywhere and any off-allowlist top-level navigation.
    if (PAYMENT.test(url.pathname)) return route.abort();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !isAllowedNavigation(url, origin)) return route.abort();
    return route.continue();
  });
});

test.afterAll(async () => { await context?.close(); });

async function blockedIfNoCreds(testInfo) {
  if (live()) return false;
  const reason = creds ? 'gate_closed' : 'missing_credentials';
  await emit(testInfo, { status: 'BLOCKED', reason });
  test.skip(true, reason);
  return true;
}

// Positive authenticated-state marker: a visible logout control, no login form.
async function expectAuthenticated() {
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
  expect(new URL(page.url()).pathname).not.toBe('/login');
  await expect(page.getByRole('button', { name: LOGOUT }).or(page.getByRole('link', { name: LOGOUT })).first())
    .toBeVisible({ timeout: HYDRATION_TIMEOUT });
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
}

test('auth_login', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"], form button').first().click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: HYDRATION_TIMEOUT });
  await expectAuthenticated();
});

test('auth_browse', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  // Every intended route must load successfully AND show authenticated content;
  // a navigation failure, 4xx/5xx or a hydrated 404 page is a FAIL, not a skip.
  for (const path of BROWSE_PATHS) {
    const res = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    expect(res, `no response for ${path}`).not.toBeNull();
    expect(res.ok(), `HTTP ${res.status()} for ${path}`).toBe(true);
    await expectAuthenticated();
    await expect(page.getByText(/\b404\b|not found|page doesn.t exist/i)).toHaveCount(0);
  }
});

test('auth_reload', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  // Reload a PROTECTED route; the session must survive with a positive auth marker.
  await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectAuthenticated();
});

test('auth_logout', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  const control = page.getByRole('button', { name: LOGOUT })
    .or(page.getByRole('link', { name: LOGOUT })).first();
  if (await control.count()) await control.click();
  else await page.goto(origin + '/logout', { waitUntil: 'domcontentloaded' });
  // After logout, a protected page must lead back to the login form.
  await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => null);
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: HYDRATION_TIMEOUT });
});
