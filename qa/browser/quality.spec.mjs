// Logged-OUT quality smoke: console errors, page timings, accessibility basics,
// in-app navigation. Safe for CI: GET-only, same-origin, no screenshots, no login.
import { test, expect } from '@playwright/test';
import { QUALITY_PAGES, realConsoleErrors, checkTiming, a11yIssues } from '../quality.mjs';
import { isCI } from '../ci.mjs';

const origin = 'https://getcircle.chat';
const HYDRATION_TIMEOUT = 15000;
const allowed = new Set(['/', '/login', '/register', '/catalog', '/products']);

const blockedUrls = [];
test.beforeEach(async ({ page }) => {
  blockedUrls.length = 0;
  await page.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    const safe = req.method() === 'GET' && url.origin === origin && !url.search
      && (!req.isNavigationRequest() || allowed.has(url.pathname));
    if (!safe) blockedUrls.push(req.url());
    return safe ? route.continue() : route.abort();
  });
  await page.routeWebSocket('**/*', socket => socket.close());
});

async function open(page, path) {
  const res = await page.goto(origin + path, { waitUntil: 'load' });
  expect(res?.ok(), `HTTP ${res?.status()} for ${path}`).toBe(true);
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
}

test('console_errors', async ({ page }, testInfo) => {
  // Site-side console errors are product findings, not code regressions: they are
  // reported by the VM QA run and must not turn this code repo's PR checks red.
  if (isCI()) {
    await testInfo.attach('qa-case', { body: Buffer.from(JSON.stringify({ status: 'BLOCKED', reason: 'vm_only' })), contentType: 'application/json' });
    test.skip(true, 'vm_only');
    return;
  }
  const seen = [];
  page.on('console', m => { if (m.type() === 'error') seen.push(`${m.text()} ${m.location()?.url || ''}`); });
  page.on('pageerror', e => seen.push(`pageerror: ${e.message}`));
  for (const path of QUALITY_PAGES) await open(page, path);
  const errors = realConsoleErrors(seen, blockedUrls);
  expect(errors, `console errors: ${errors.length}`).toEqual([]);
});

test('perf_timings', async ({ page }) => {
  for (const path of QUALITY_PAGES) {
    await open(page, path);
    const nav = await page.evaluate(() => JSON.parse(JSON.stringify(performance.getEntriesByType('navigation')[0] || null)));
    const t = checkTiming(nav);
    expect(t.ok, `${path} dcl=${t.domContentLoaded}ms load=${t.load}ms`).toBe(true);
  }
});

test('a11y_basics', async ({ page }) => {
  for (const path of ['/login', '/register']) {
    await open(page, path);
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: HYDRATION_TIMEOUT });
    const snapshot = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      inputs: [...document.querySelectorAll('input')].map(i => ({
        type: i.type,
        labelled: Boolean(i.labels?.length || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')),
      })),
      images: [...document.querySelectorAll('img')].map(i => ({ alt: i.getAttribute('alt') })),
    }));
    expect(a11yIssues(snapshot), path).toEqual([]);
  }
});

test('navigation', async ({ page }) => {
  await open(page, '/register');
  // In-app link from register to login must work without a full reload error.
  await page.locator('a[href="/login"]').first().click();
  await expect(page).toHaveURL(/\/login$/, { timeout: HYDRATION_TIMEOUT });
  await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: HYDRATION_TIMEOUT });
  await page.goBack();
  await expect(page).toHaveURL(/\/register$/, { timeout: HYDRATION_TIMEOUT });
});
