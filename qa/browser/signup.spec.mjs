// Registration of at most four clearly-synthetic users through the normal UI.
// No screenshots are taken here: this module never imports qa/screenshots.mjs, so
// authenticated/raw evidence has no code path into the publishable directory.
import { test, expect } from '@playwright/test';
import { gate } from '../guard.mjs';
import { MAX_USERS, credentials, plan, classify, cleanupId } from '../identity.mjs';

const origin = 'https://getcircle.chat';
const navAllow = new Set(['/', '/login', '/register', '/catalog', '/products', '/dashboard', '/home', '/app', '/account', '/onboarding', '/logout']);
// Payment/billing surfaces are hard-blocked at the network layer, never visited.
const PAYMENT = /pay|checkout|billing|subscri|invoice|card|stripe|plan|upgrade/i;

function emit(testInfo, payload) {
  return testInfo.attach('qa-case', { body: Buffer.from(JSON.stringify(payload)), contentType: 'application/json' });
}

const indices = plan(MAX_USERS);
expect(indices.length).toBeLessThanOrEqual(MAX_USERS);

test.describe.configure({ mode: 'serial' });

for (const index of indices) {
  test(`signup_user_${index + 1}`, async ({ page }, testInfo) => {
    expect(process.env.GITHUB_ACTIONS).toBe('true');
    expect(['schedule', 'workflow_dispatch']).toContain(process.env.GITHUB_EVENT_NAME);
    expect(gate(process.env).allowed).toBe(true);

    let creds;
    try {
      creds = credentials(index);
    } catch (error) {
      await emit(testInfo, { status: 'BLOCKED', reason: error.blocked || 'missing_email_domain' });
      test.skip(true, 'synthetic identity unavailable');
      return;
    }
    const cleanup = cleanupId(index);

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const blocked = url.origin !== origin
        || PAYMENT.test(url.pathname)
        || !gate(process.env).allowed
        || (request.isNavigationRequest() && request.method() === 'GET' && !navAllow.has(url.pathname));
      await (blocked ? route.abort() : route.continue());
    });
    await page.routeWebSocket('**/*', socket => socket.close());

    let httpStatus = 0;
    const response = await page.goto(origin + '/register', { waitUntil: 'domcontentloaded' });
    if (!response?.ok()) {
      await emit(testInfo, { status: 'BLOCKED', reason: response?.status() === 429 ? 'rate_limited' : `server_error_${response?.status() ?? 500}`, cleanup });
      test.skip(true, 'register page unavailable');
      return;
    }

    const email = page.locator('input[type="email"]').first();
    const password = page.locator('input[type="password"]').first();
    const name = page.locator('input[name*="name" i], input[id*="name" i]').first();
    if (await email.count() === 0 || await password.count() === 0) {
      await emit(testInfo, { status: 'BLOCKED', reason: 'registration_closed', cleanup });
      test.skip(true, 'registration form not present');
      return;
    }
    if (await name.count() > 0) await name.fill(creds.fullName);
    await email.fill(creds.email);
    await password.fill(creds.password);

    page.on('response', r => { if (r.request().isNavigationRequest()) httpStatus = r.status(); });

    // Exactly one submit attempt. No blind retry.
    await page.locator('button[type="submit"], input[type="submit"]').first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(2000);

    const visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
    const navigatedTo = new URL(page.url()).pathname;
    const verdict = classify({ visibleText, status: httpStatus, navigatedTo });

    // Only non-sensitive cleanup identifiers leave this test.
    await emit(testInfo, { status: verdict.status, reason: verdict.reason, cleanup });
    if (verdict.status === 'BLOCKED') test.skip(true, `registration blocked: ${verdict.reason}`);
    expect(verdict.status, `registration outcome: ${verdict.reason}`).toBe('PASS');
  });
}
