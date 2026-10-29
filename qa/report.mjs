import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { listPublished } from './screenshots.mjs';
import { outputDir, resultsPath } from './output.mjs';

// ONE account only: logged-in cases use the single pre-provisioned account from env.
// Sign-up is checked for form validation only and is never submitted.
const ALL = {login_ui:'/login',register_ui:'/register',signup_validation:'/register',catalog_ui:'/',payment:'/',auth_login:'/login',auth_browse:'/',auth_reload:'/dashboard',auth_logout:'/logout'};
// Payment/billing stays BLOCKED unconditionally.
const ALWAYS_BLOCKED = new Set(['payment']);
const STATUSES = ['PASS','FAIL','BLOCKED','NOT_RUN'];
// Only these blocker reasons may surface; anything else is collapsed.
const REASONS = new Set(['rate_limited','form_not_rendered','missing_credentials','not_run','gate_closed','ci_not_allowed','server_error_500','server_error_502','server_error_503']);

export function sanitize(input = []) {
  const cases = Object.entries(ALL).map(([label,route])=>{
    const found = input.find(c=>c.label===label);
    const status = ALWAYS_BLOCKED.has(label) ? 'BLOCKED'
      : STATUSES.includes(found?.status) ? found.status : 'NOT_RUN';
    const entry = {label,route,status};
    const reason = typeof found?.reason === 'string' && REASONS.has(found.reason) ? found.reason : undefined;
    if (reason) entry.reason = reason;
    return entry;
  });
  return {
    schema:3,
    runner:'deterministic_playwright_not_ai',
    cases,
    screenshots: listPublished().map(p=>path.basename(p)),
  };
}

export function save(input = []) {
 const result=sanitize(input);
 fs.mkdirSync(outputDir(),{recursive:true});
 fs.writeFileSync(resultsPath(),JSON.stringify(result,null,2)+'\n');
 // Summary: labels + PASS/FAIL/BLOCKED only. In CI it goes to the job summary
 // (sanitized, fixed labels, no page content); locally to stdout.
 if(process.argv.includes('--summary')) {
  const lines=result.cases.map(c=>`${c.label}: ${c.status}${c.reason?` (${c.reason})`:''}`).join('\n');
  if(process.argv.includes('--ci') && process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Public smoke (logged out)\n```\n'+lines+'\n```\n');
  else console.log(lines);
 }
}

export default class Reporter {
 constructor() {this.results=[];}
 onTestEnd(test,result) {
  const attached=(result.attachments||[]).find(a=>a.name==='qa-case');
  let extra={};
  if(attached?.body){ try{ extra=JSON.parse(attached.body.toString('utf8')); }catch{ extra={}; } }
  this.results.push({label:test.title,status:extra.status||(result.status==='passed'?'PASS':result.status==='skipped'?'BLOCKED':'FAIL'),reason:extra.reason,cleanup:extra.cleanup});
 }
 onEnd(result) {if(result.status!=='passed' && !this.results.some(c=>c.status==='FAIL')) this.results.push({label:'login_ui',status:'FAIL'}); save(this.results);}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const input=process.argv.includes('--summary') && fs.existsSync(resultsPath()) ? JSON.parse(fs.readFileSync(resultsPath(),'utf8')).cases : [];
 save(input);
}
