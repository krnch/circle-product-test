import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const routes = {login_ui:'/login',register_ui:'/register',catalog_ui:'/',signup_submit:'/register',authenticated_journey:'/login',payment:'/'};
export function sanitize(input = []) {
  return {schema:1, runner:'deterministic_playwright_not_ai', cases:Object.entries(routes).map(([label,route])=>{
    const found = input.find(c=>c.label===label);
    const status = ['signup_submit','authenticated_journey','payment'].includes(label) ? 'BLOCKED' : ['PASS','FAIL','BLOCKED','NOT_RUN'].includes(found?.status) ? found.status : 'NOT_RUN';
    return {label,route,status};
  })};
}
export function save(input = []) {
 const result=sanitize(input);
 fs.mkdirSync('qa-output',{recursive:true});
 fs.writeFileSync('qa-output/results.json',JSON.stringify(result,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY && process.argv.includes('--summary')) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Public-only QA (not authenticated coverage)\n'+result.cases.map(c=>`- ${c.label}: **${c.status}** (${c.route})`).join('\n')+'\nSignup/identity eligibility and payment sandbox remain unresolved.\n');
}
export default class Reporter {
 constructor() {this.results=[];}
 onTestEnd(test,result) {this.results.push({label:test.title,status:result.status==='passed'?'PASS':result.status==='skipped'?'BLOCKED':'FAIL'});}
 onEnd(result) {if(result.status!=='passed' && !this.results.some(c=>c.status==='FAIL')) this.results.push({label:'login_ui',status:'FAIL'}); save(this.results);}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const input=process.argv.includes('--summary') && fs.existsSync('qa-output/results.json') ? JSON.parse(fs.readFileSync('qa-output/results.json','utf8')).cases : [];
 save(input);
}
