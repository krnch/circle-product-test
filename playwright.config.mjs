import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./qa/browser',workers:1,fullyParallel:false,retries:0,timeout:30000,globalTimeout:180000,reporter:[['./qa/report.mjs']],outputDir:'/tmp/circle-qa-unused',use:{browserName:'chromium',headless:true,trace:'off',screenshot:'off',video:'off',serviceWorkers:'block'}});
