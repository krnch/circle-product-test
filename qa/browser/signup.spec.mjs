// Registration of at most four clearly-synthetic users through the normal UI.
// No screenshots are taken here: this module never imports qa/screenshots.mjs, so
// authenticated/raw evidence has no code path into the publishable directory.
import { test, expect } from '@playwright/test';
import { gate } from '../guard.mjs';
import { MAX_USERS, MIN_PASSWORD_LENGTH, credentials, plan, classify, cleanupId, unrenderedReason } from '../identity.mjs';

// getcircle.chat is a client-rendered Vue SPA: GET /register returns only
// <div id="app"></div> plus module scripts, with zero form markup. Any check that
// runs at 'domcontentloaded' therefore sees no inputs and must NOT conclude
// anything about registration being open or closed. Wait for hydration first.
const HYDRATION_TIMEOUT = 15000;

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
    // Resilient full-name strategy, in descending order of stability:
    //   1. accessible label text ("Full Name") — the label is bound via for=/id=,
    //      so getByLabel survives the auto-generated v-N ids entirely;
    //   2. the observed placeholder ("Annie Duffy");
    //   3. structural fallback: the first bare text input inside the form.
    // The real DOM has EMPTY name attributes and volatile ids (v-4/v-5/v-6), so the
    // previous input[name*="name"], input[id*="name"] selector could never match,
    // and hardcoding v-4 would break on the next build.
    const name = page.getByLabel(/full\s*name/i)
      .or(page.locator('input[placeholder="Annie Duffy"]'))
      .or(page.locator('form input[type="text"]'))
      .or(page.locator('input[name*="name" i], input[id*="name" i]'))
      .first();

    // Genuine web-first wait for SPA hydration. ONLY after this times out may the
    // harness report BLOCKED, and the reason is then 'form_not_rendered' unless the
    // page actually says invite/waitlist/closed.
    let hydrated = true;
    try {
      await expect(email).toBeVisible({ timeout: HYDRATION_TIMEOUT });
      await expect(password).toBeVisible({ timeout: HYDRATION_TIMEOUT });
    } catch {
      hydrated = false;
    }
    if (!hydrated) {
      const visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
      await emit(testInfo, { status: 'BLOCKED', reason: unrenderedReason(visibleText), cleanup });
      test.skip(true, 'registration form did not render');
      return;
    }

    if (await name.count() > 0) await name.fill(creds.fullName);
    // Observed policy: "Min 12 characters". Fail loudly rather than blame the product.
    expect(creds.password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
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
