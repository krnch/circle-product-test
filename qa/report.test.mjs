import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from './report.mjs';

test('failure fixtures cannot export arbitrary source payload', () => {
  const result = sanitize([{label:'login_ui',status:'FAIL',url:'https://getcircle.chat/login?email=secret',error:'secret',console:'secret'},{label:'secret',status:'PASS'}]);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(result.cases.find(c=>c.label==='login_ui').status, 'FAIL');
  assert.equal(result.cases.find(c=>c.label==='payment').status, 'BLOCKED');
  assert.equal(result.cases.find(c=>c.label==='signup_validation').status, 'NOT_RUN');
});

test('one account only: no multi-user or synthetic sign-up labels, no account records', () => {
  const result = sanitize([{label:'signup_user_1',status:'PASS',cleanup:{index:0,local_part:'x'}}]);
  assert.equal(result.cases.some(c=>/signup_user|signup_submit/.test(c.label)), false);
  assert.equal('accounts' in result, false);
  assert.equal('max_users' in result, false);
});

test('blocker reasons are allowlisted', () => {
  const result = sanitize([
    {label:'auth_login',status:'BLOCKED',reason:'ci_not_allowed'},
    {label:'auth_browse',status:'PASS',reason:'arbitrary attacker string'},
  ]);
  assert.equal(result.cases.find(c=>c.label==='auth_login').reason, 'ci_not_allowed');
  assert.equal(result.cases.find(c=>c.label==='auth_browse').reason, undefined);
});
