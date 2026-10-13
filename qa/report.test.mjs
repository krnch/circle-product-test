import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('./report.mjs').catch(()=>({}));
test('failure fixtures cannot export arbitrary source payload',()=>{
 assert.equal(typeof module.sanitize,'function');
 const result=module.sanitize([{label:'login_ui',status:'FAIL',url:'https://getcircle.chat/login?email=secret',error:'secret',console:'secret'},{label:'secret',status:'PASS'}]);
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(result.cases.find(c=>c.label==='login_ui').status,'FAIL');
 // payment is unconditionally BLOCKED; unobserved signup rolls up honestly as NOT_RUN
 assert.equal(result.cases.find(c=>c.label==='payment').status,'BLOCKED');
 assert.equal(result.cases.find(c=>c.label==='signup_submit').status,'NOT_RUN');
 for(let i=1;i<=4;i++) assert.equal(result.cases.find(c=>c.label===`signup_user_${i}`).status,'NOT_RUN');
});

test('blocker reasons are allowlisted and cleanup records are stripped to safe fields',()=>{
 const result=module.sanitize([
  {label:'signup_user_1',status:'BLOCKED',reason:'captcha_challenge',cleanup:{index:0,local_part:'circle-qa-synthetic-abc-1',email:'leak@example.com',password:'leak'}},
  {label:'signup_user_2',status:'PASS',reason:'arbitrary attacker string'},
 ]);
 assert.equal(JSON.stringify(result).includes('leak'),false);
 assert.equal(result.cases.find(c=>c.label==='signup_user_1').reason,'captcha_challenge');
 assert.equal(result.cases.find(c=>c.label==='signup_user_2').reason,undefined);
 assert.deepEqual(result.accounts,[{index:0,local_part:'circle-qa-synthetic-abc-1',synthetic:true}]);
});
