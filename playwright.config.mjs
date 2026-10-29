import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { outputDir } from './qa/output.mjs';
// ALL Playwright artifacts (error-context, attachments) go under $QA_OUTPUT_DIR,
// which qa/output.mjs forces outside the repo. Never /tmp or the checkout.
// Traces, screenshots and video stay off.
export default defineConfig({testDir:'./qa/browser',workers:1,fullyParallel:false,retries:0,timeout:30000,globalTimeout:180000,reporter:[['./qa/report.mjs']],outputDir:path.join(outputDir(),'playwright-artifacts'),use:{browserName:'chromium',headless:true,trace:'off',screenshot:'off',video:'off',serviceWorkers:'block'}});
