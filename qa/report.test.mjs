import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('./report.mjs').catch(()=>({}));
test('failure fixtures cannot export arbitrary source payload',()=>{
 assert.equal(typeof module.sanitize,'function');
 const result=module.sanitize([{label:'login_ui',status:'FAIL',url:'https://getcircle.chat/login?email=secret',error:'secret',console:'secret'},{label:'secret',status:'PASS'}]);
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(result.cases.find(c=>c.label==='login_ui').status,'FAIL');
 assert.equal(result.cases.find(c=>c.label==='signup_submit').status,'BLOCKED');
});
