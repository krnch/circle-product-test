// Sign-up FORM VALIDATION ONLY. Logged-out, public, safe for CI.
// ONE ACCOUNT ONLY policy: this spec never creates an account. It never clicks
// submit, never presses Enter in the form, and aborts every non-GET request.
import { test, expect } from '@playwright/test';

const origin = 'https://getcircle.chat';
const HYDRATION_TIMEOUT = 15000;

test('signup_validation', async ({ page }) => {
  const writes = [];
  await page.route('**/*', route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    if (url.origin !== origin) return route.abort();
    if (req.isNavigationRequest() && !['/register', '/login'].includes(url.pathname)) return route.abort();
    return route.continue();
  });
  await page.routeWebSocket('**/*', socket => socket.close());

  const res = await page.goto(origin + '/register', { waitUntil: 'domcontentloaded' });
  expect(res?.ok()).toBe(true);
  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();
  await expect(email).toBeVisible({ timeout: HYDRATION_TIMEOUT });
  await expect(password).toBeVisible({ timeout: HYDRATION_TIMEOUT });

  // Client-side validity only, via the browser's constraint API. No submit.
  await email.fill('not-an-email');
  expect(await email.evaluate(el => el.checkValidity())).toBe(false);
  await email.fill('');
  await password.fill('');
  // A submit control exists, but it is never activated.
  await expect(page.locator('button[type="submit"], input[type="submit"]').first()).toBeAttached();
  // Every write is aborted above. The site fires its own background auth-refresh POST
  // on load; that is not ours. What must never happen is a registration request.
  expect(writes.filter(p => /regist|sign.?up|\/users\/?$|\/accounts?\/?$/i.test(p))).toEqual([]);
});
