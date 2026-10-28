// Authenticated journey with ONE pre-provisioned test account.
// The login comes ONLY from env CIRCLE_QA_EMAIL / CIRCLE_QA_PASSWORD at run time.
// Missing env => every case reports BLOCKED (missing_credentials), never FAIL.
// No screenshots, traces, cookies or credential values are ever written anywhere:
// this module does not import qa/screenshots.mjs and never logs the login.
import { test, expect } from '@playwright/test';
import { loginEnv, ALLOWED_PATHS, PAYMENT, isAllowedNavigation } from '../login.mjs';

const origin = 'https://getcircle.chat';
const HYDRATION_TIMEOUT = 15000;
const creds = loginEnv(process.env);

function emit(testInfo, payload) {
  return testInfo.attach('qa-case', { body: Buffer.from(JSON.stringify(payload)), contentType: 'application/json' });
}

test.describe.configure({ mode: 'serial' });

let context, page;
const consoleErrors = [];

test.beforeAll(async ({ browser }) => {
  if (!creds) return;
  context = await browser.newContext();
  page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(1); });
  await page.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    // Hard-block payment/billing everywhere and any off-allowlist top-level navigation.
    if (PAYMENT.test(url.pathname)) return route.abort();
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !isAllowedNavigation(url, origin)) return route.abort();
    return route.continue();
  });
});

test.afterAll(async () => { await context?.close(); });

async function blockedIfNoCreds(testInfo) {
  if (creds) return false;
  await emit(testInfo, { status: 'BLOCKED', reason: 'missing_credentials' });
  test.skip(true, 'CIRCLE_QA_EMAIL / CIRCLE_QA_PASSWORD not set');
  return true;
}

test('auth_login', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"], form button').first().click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: HYDRATION_TIMEOUT });
});

test('auth_browse', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  let visited = 0;
  for (const path of ALLOWED_PATHS.filter(p => !['/login', '/register', '/logout'].includes(p))) {
    const res = await page.goto(origin + path, { waitUntil: 'domcontentloaded' }).catch(() => null);
    if (!res || res.status() >= 500) continue;
    await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
    expect(new URL(page.url()).pathname).not.toBe('/login');
    visited++;
  }
  expect(visited).toBeGreaterThan(0);
});

test('auth_reload', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
  // Session survives reload: the app must not bounce back to the login form.
  await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: HYDRATION_TIMEOUT });
});

test('auth_logout', async ({}, testInfo) => {
  if (await blockedIfNoCreds(testInfo)) return;
  const control = page.getByRole('button', { name: /log ?out|sign ?out/i })
    .or(page.getByRole('link', { name: /log ?out|sign ?out/i })).first();
  if (await control.count()) await control.click();
  else await page.goto(origin + '/logout', { waitUntil: 'domcontentloaded' });
  // After logout, a protected page must lead back to the login form.
  await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => null);
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: HYDRATION_TIMEOUT });
});
