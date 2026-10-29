import { test, expect } from '@playwright/test';
import { capturePublic } from '../screenshots.mjs';
import { isCI } from '../ci.mjs';
const origin='https://getcircle.chat';
const allowed=new Set(['/','/login','/register','/catalog','/products']);
// Client-rendered Vue SPA: initial HTML is <div id="app"></div> only. Every
// assertion below must wait for hydration; an instantaneous check would report a
// false defect, not a real one.
const HYDRATION_TIMEOUT=15000;
// Logged-OUT public smoke. Runs in GitHub Actions CI and on the VM.
// GET-only, same-origin, allowlisted navigation, no query strings, no websockets.
test.beforeEach(async({page})=>{
  await page.route('**/*', async route=>{
    const request=route.request(); const url=new URL(request.url());
    const safe=request.method()==='GET' && url.origin===origin && !url.search && (!request.isNavigationRequest() || allowed.has(url.pathname));
    await (safe ? route.continue() : route.abort());
  });
  await page.routeWebSocket('**/*', socket=>socket.close());
});
async function visit(page,path){
  const response=await page.goto(origin+path,{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBe(true);
  expect(new URL(page.url()).pathname).toBe(path);
  // Wait for the SPA to actually mount before asserting or capturing: a
  // screenshot taken at domcontentloaded is an empty <div id="app">.
  await expect(page.locator('#app')).not.toBeEmpty({timeout:HYDRATION_TIMEOUT});
  // CI produces pass/fail only: never screenshots. On the VM, capturePublic writes to
  // $QA_OUTPUT_DIR and refuses a session-bearing context.
  if(!isCI()) await capturePublic(page,path);
}
test('login_ui',async({page})=>{
  await visit(page,'/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({timeout:HYDRATION_TIMEOUT});
  await expect(page.locator('input[type="password"]')).toBeVisible({timeout:HYDRATION_TIMEOUT});
  // Native validity inspection only: no click, submit, credentials or synthetic identity.
  expect(await page.locator('input[type="email"]').evaluate(input=>input.value==='' && !input.checkValidity())).toBe(true);
});
test('register_ui',async({page})=>{
  await visit(page,'/register');
  await expect(page.locator('input[type="email"]')).toBeVisible({timeout:HYDRATION_TIMEOUT});
  await expect(page.locator('input[type="password"]')).toBeVisible({timeout:HYDRATION_TIMEOUT});
  // Vue RouterLink renders a real anchor, but only after hydration.
  await expect(page.locator('a[href="/login"]').first()).toBeVisible({timeout:HYDRATION_TIMEOUT});
  // The register inputs are not marked `required` (unlike /login), so an empty
  // value can be natively valid. Assert only what is actually true: the field
  // starts empty. Reporting a FAIL here would be a harness artefact, not a defect.
  expect(await page.locator('input[type="email"]').first().inputValue()).toBe('');
});
test('catalog_ui',async({page},testInfo)=>{
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  // Wait for hydration before concluding the link is absent: before mount the
  // whole page is empty, so an instantaneous count() always reads zero.
  await expect(page.locator('#app')).not.toBeEmpty({timeout:HYDRATION_TIMEOUT});
  const link=page.locator('a[href="/catalog"], a[href="/products"]').first();
  const present=await link.count().catch(()=>0)>0
    || await link.waitFor({state:'attached',timeout:HYDRATION_TIMEOUT}).then(()=>true).catch(()=>false);
  // Root cause (2026-10-29): the logged-out home only links /forgot-password and
  // /register; the catalog exists only behind login. Report BLOCKED auth_only_route
  // (covered by auth_browse on the VM), not an unexplained skip.
  if(!present) await testInfo.attach('qa-case',{body:Buffer.from(JSON.stringify({status:'BLOCKED',reason:'auth_only_route'})),contentType:'application/json'});
  test.skip(!present,'auth_only_route: no public catalog link; covered by auth_browse');
  const path=await link.getAttribute('href');
  await visit(page,path);
  await expect(page.locator('body')).toBeVisible();
});
