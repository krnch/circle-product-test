import { test, expect } from '@playwright/test';
import { gate } from '../guard.mjs';
import { capturePublic } from '../screenshots.mjs';
const origin='https://getcircle.chat';
const allowed=new Set(['/','/login','/register','/catalog','/products']);
test.beforeEach(async({page})=>{
  expect(process.env.GITHUB_ACTIONS).toBe('true');
  expect(['schedule','workflow_dispatch']).toContain(process.env.GITHUB_EVENT_NAME);
  expect(gate(process.env).allowed).toBe(true);
  await page.route('**/*', async route=>{
    const request=route.request(); const url=new URL(request.url());
    const safe=request.method()==='GET' && url.origin===origin && !url.search && (!request.isNavigationRequest() || allowed.has(url.pathname)) && gate(process.env).allowed;
    await (safe ? route.continue() : route.abort());
  });
  await page.routeWebSocket('**/*', socket=>socket.close());
});
async function visit(page,path){
  expect(gate(process.env).allowed).toBe(true);
  const response=await page.goto(origin+path,{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe(path);
  // Unauthenticated context only: capturePublic refuses a session-bearing context.
  await capturePublic(page,path);
}
test('login_ui',async({page})=>{
  await visit(page,'/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  // Native validity inspection only: no click, submit, credentials or synthetic identity.
  expect(await page.locator('input[type="email"]').evaluate(input=>input.value==='' && !input.checkValidity())).toBe(true);
});
test('register_ui',async({page})=>{
  await visit(page,'/register');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('a[href="/login"]')).toBeVisible();
  expect(await page.locator('input[type="email"]').evaluate(input=>input.value==='' && !input.checkValidity())).toBe(true);
});
test('catalog_ui',async({page})=>{
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  const link=page.locator('a[href="/catalog"], a[href="/products"]').first();
  test.skip(await link.count()===0,'Public catalog unavailable; authenticated catalog blocked');
  const path=await link.getAttribute('href');
  await visit(page,path);
  await expect(page.locator('body')).toBeVisible();
});
