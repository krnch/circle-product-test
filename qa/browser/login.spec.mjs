// Authenticated journey with ONE pre-provisioned test account.
// The login comes ONLY from env CIRCLE_QA_EMAIL / CIRCLE_QA_PASSWORD at run time.
// Missing env => every step reports BLOCKED (missing_credentials), never FAIL.
// No screenshots, traces, cookies or credential values are ever written anywhere:
// this module does not import qa/screenshots.mjs and never logs the login.
//
// Site facts (from its own router bundle, 2026-10-29):
//  - Sign-in: POST /api/v1/auth/login, then window.location.replace(redirect || '/dms').
//    That full navigation to /dms must be allowed, or the page stays on /login with no
//    error (root cause of the 2026-10-29 auth_login FAIL: /dms was not allowlisted).
//  - Catalog = /explore/shops and /explore/groups (logged-in only).
//  - Log out = button "Log out" (data-testid me-logout) on /me.
//
// ONE test, one browser session, independently reported steps. Playwright restarts
// the worker after any failed test, which would drop a shared login across tests;
// here a failed step is recorded and the journey continues with the next step.
import { test, expect } from '@playwright/test';
import { loginEnv, HOME, CATALOG_PATHS, BROWSE_PATHS, isPaymentRequest, isAllowedNavigation, redact, SUBMIT } from '../login.mjs';
import { gate } from '../guard.mjs';
import { isCI } from '../ci.mjs';

const origin = 'https://getcircle.chat';
const HYDRATION_TIMEOUT = 15000;
// Hard per-step budget: a stalled action can never eat the next steps' time.
// 5 steps x 25s + setup = 140s test timeout, inside the 420s global run timeout.
const STEP_TIMEOUT = 25000;
// Logged-in QA is VM-only: in CI the login is never even read from env.
const creds = isCI() ? null : loginEnv(process.env);
// Credentials alone never enable a live login: the fail-closed QA window must be open too.
const live = () => !isCI() && Boolean(creds) && gate(process.env).allowed;
const LOGOUT = /^\s*(log ?out|sign ?out)\s*$/i;
const NOT_FOUND = /\b404\b|not found|page doesn.t exist/i;
const STEPS = ['auth_login', 'auth_browse', 'catalog_ui', 'auth_reload', 'auth_logout'];

class StepFailure extends Error {
  constructor(reason, detail) { super(reason); this.reason = reason; this.detail = detail; }
}

test('auth_journey', async ({ browser }, testInfo) => {
  test.setTimeout(STEPS.length * STEP_TIMEOUT + 15000);
  const report = (label, status, reason, detail) => testInfo.attach('qa-step', {
    body: Buffer.from(JSON.stringify({ label, status, reason, detail: detail ? redact(detail, creds || {}) : undefined })),
    contentType: 'application/json',
  });

  if (!live()) {
    const reason = isCI() ? 'ci_not_allowed' : creds ? 'gate_closed' : 'missing_credentials';
    for (const s of STEPS) await report(s, 'BLOCKED', reason);
    test.skip(true, reason);
    return;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(HYDRATION_TIMEOUT);
  page.setDefaultNavigationTimeout(HYDRATION_TIMEOUT);
  const blockedNav = [];
  const blockedReq = [];
  // Auth API status codes (path + status only, never bodies/headers) to explain a lost session.
  const authCalls = [];
  page.on('response', r => { const p = new URL(r.url()).pathname; if (p.startsWith('/api/v1/auth/')) authCalls.push(`${p.replace('/api/v1/auth/', '')}:${r.status()}`); });
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    // Re-check the window on every request; abort everything once it closes.
    if (!gate(process.env).allowed) return route.abort();
    // Hard-block payment navigations/API calls and payment hosts (not static bundles).
    // Aborted paths (no query, no body) are kept so a FAIL says what we blocked.
    // No Playwright trace here: it would record the typed password and login body.
    if (isPaymentRequest(url, origin, req.isNavigationRequest(), req.method())) { blockedReq.push(url.hostname === new URL(origin).hostname ? url.pathname : url.hostname); return route.abort(); }
    if (req.isNavigationRequest() && req.frame() === page.mainFrame() && !isAllowedNavigation(url, origin)) {
      // Record (path only) so a blocked post-login redirect is visible in the report.
      blockedNav.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });

  // Positive authenticated-state marker: app shell on a logged-in route with the
  // /me nav link, no password field. The router guard sends anonymous users to /login.
  async function expectAuthenticated() {
    await expect(page.locator('#app')).not.toBeEmpty({ timeout: HYDRATION_TIMEOUT });
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: HYDRATION_TIMEOUT });
    await expect(page.locator('a[href="/me"]').first()).toBeVisible({ timeout: HYDRATION_TIMEOUT });
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  }

  const failures = [];
  let loggedIn = false;
  let aborted = false;
  async function step(label, needsLogin, body) {
    if (needsLogin && !loggedIn) { await report(label, 'BLOCKED', 'login_failed'); return; }
    if (aborted) { await report(label, 'BLOCKED', 'step_aborted'); return; }
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new StepFailure('step_timeout', `${label} exceeded ${STEP_TIMEOUT}ms`)), STEP_TIMEOUT); });
    const work = body();
    try {
      await Promise.race([work, deadline]);
      await report(label, 'PASS');
    } catch (e) {
      const reason = e instanceof StepFailure ? e.reason : undefined;
      const raw = e instanceof StepFailure ? e.detail : String(e?.message || e).replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0];
      const blocked = [...new Set(blockedReq)].slice(0, 5);
      let detail = blocked.length ? `${raw} blocked_req=${blocked.join(',')}` : raw;
      detail += ` url=${new URL(page.url()).pathname} auth=${authCalls.slice(-6).join(',') || 'none'}`;
      failures.push(label);
      await report(label, 'FAIL', reason, detail);
      if (reason === 'step_timeout') {
        // Promise.race cannot cancel body(): close the session so every pending
        // action rejects, wait for it to settle, and run nothing else on it.
        aborted = true;
        await context.close().catch(() => {});
        await work.catch(() => {});
      }
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    await step('auth_login', false, async () => {
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
        // Clear the form so no failure context can hold the login values.
        await page.locator('input[type="email"]').fill('').catch(() => {});
        await page.locator('input[type="password"]').fill('').catch(() => {});
        const reason = apiStatus >= 400 || banner.length ? 'login_rejected' : blockedNav.length ? 'redirect_blocked' : 'no_error_shown';
        throw new StepFailure(reason, redact(parts.join(' '), creds));
      }
      await expectAuthenticated();
      loggedIn = true;
    });

    await step('auth_browse', true, async () => {
      // Every intended route must load successfully AND show authenticated content.
      for (const path of BROWSE_PATHS) {
        const res = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
        if (!res?.ok()) throw new StepFailure(undefined, `HTTP ${res?.status() ?? 'none'} for ${path}`);
        await expectAuthenticated();
        await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
        // A SPA error page can keep HTTP 200, the URL and the shell: check the content too.
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
      }
    });

    await step('catalog_ui', true, async () => {
      // Logged-in catalog: Explore -> Shops via the app's own nav link (in-app routing).
      await page.goto(origin + HOME, { waitUntil: 'domcontentloaded' });
      await expectAuthenticated();
      await page.locator(`a[href="${CATALOG_PATHS[0]}"]`).first().click();
      await expect(page).toHaveURL(/\/explore\/shops$/, { timeout: HYDRATION_TIMEOUT });
      await expect(page.locator('#app')).not.toBeEmpty();
      await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    });

    await step('auth_reload', true, async () => {
      // Reload a PROTECTED route; the session must survive with a positive auth marker.
      // Settle first: reloading while the page's own token refresh is in flight aborts
      // that request after the server has already rotated the (single-use) refresh
      // token, which then 401s on the reload and looks like a lost session.
      await page.goto(origin + HOME, { waitUntil: 'domcontentloaded' });
      await expectAuthenticated();
      await page.waitForLoadState('networkidle', { timeout: HYDRATION_TIMEOUT }).catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectAuthenticated();
      await expect(page).toHaveURL(/\/dms$/);
    });

    await step('auth_logout', true, async () => {
      await page.goto(origin + '/me', { waitUntil: 'domcontentloaded' });
      const control = page.locator('[data-testid="me-logout"]')
        .or(page.getByRole('button', { name: LOGOUT })).first();
      await expect(control).toBeVisible({ timeout: HYDRATION_TIMEOUT });
      await control.click();
      // The site asks "Log out?" in a confirm dialog before signing out; accept it.
      const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: /log out/i }).first();
      await expect(dialog).toBeVisible({ timeout: HYDRATION_TIMEOUT });
      await dialog.getByRole('button', { name: /^\s*(yes|log ?out|confirm|ok)\s*$/i }).first().click();
      await expect(page).toHaveURL(/\/login/, { timeout: HYDRATION_TIMEOUT });
      // After logout, a protected page must lead back to the login form.
      await page.goto(origin + HOME, { waitUntil: 'domcontentloaded' }).catch(() => null);
      await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: HYDRATION_TIMEOUT });
    });
  } finally {
    await context.close().catch(() => {});
  }

  expect(failures, `failed steps: ${failures.join(', ')}`).toEqual([]);
});
