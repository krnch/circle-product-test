import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MAX_USERS } from './identity.mjs';
import { listPublished } from './screenshots.mjs';

const routes = {login_ui:'/login',register_ui:'/register',catalog_ui:'/',signup_submit:'/register',authenticated_journey:'/login',payment:'/'};
const userRoutes = Object.fromEntries(Array.from({length:MAX_USERS},(_,i)=>[`signup_user_${i+1}`,'/register']));
const ALL = {...routes, ...userRoutes};
// Payment/billing stays BLOCKED unconditionally; signup_submit/authenticated_journey
// are rollups that may only report what the browser actually observed.
const ALWAYS_BLOCKED = new Set(['payment']);
const STATUSES = ['PASS','FAIL','BLOCKED','NOT_RUN'];
// Only these blocker reasons may surface publicly; anything else is collapsed.
const REASONS = new Set(['captcha_challenge','email_verification_required','rate_limited','registration_closed','consent_required','no_authenticated_state_observed','registration_rejected','registered','missing_email_domain','not_run','gate_closed','server_error_500','server_error_502','server_error_503']);

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
  const accounts = input
    .filter(c=>c.cleanup && Number.isInteger(c.cleanup.index) && typeof c.cleanup.local_part === 'string')
    .slice(0, MAX_USERS)
    .map(c=>({index:c.cleanup.index, local_part:c.cleanup.local_part.replace(/[^a-z0-9-]/gi,''), synthetic:true}));
  return {
    schema:2,
    runner:'deterministic_playwright_not_ai',
    cases,
    // Cleanup identifiers only: no addresses, passwords, cookies or tokens.
    accounts,
    screenshots: listPublished().map(p=>p.split('/').pop()),
    max_users: MAX_USERS,
  };
}

export function save(input = []) {
 const result=sanitize(input);
 fs.mkdirSync('qa-output',{recursive:true});
 fs.writeFileSync('qa-output/results.json',JSON.stringify(result,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY && process.argv.includes('--summary')) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Public-only QA (not authenticated coverage)\n'+result.cases.map(c=>`- ${c.label}: **${c.status}**${c.reason?` (${c.reason})`:''} (${c.route})`).join('\n')+'\nPayment sandbox remains BLOCKED.\n');
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
 const input=process.argv.includes('--summary') && fs.existsSync('qa-output/results.json') ? JSON.parse(fs.readFileSync('qa-output/results.json','utf8')).cases : [];
 save(input);
}
