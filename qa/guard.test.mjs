import test from 'node:test';
import assert from 'node:assert/strict';
import { gate } from './guard.mjs';
const now = Date.parse('2026-10-13T03:00:00Z');
const good = {QA_ENABLED:'true', QA_STARTED_AT:'2026-10-13T03:00:00Z', QA_EXPIRES_AT:'2026-10-14T03:00:00Z'};
test('explicit enabled and bounded UTC window required', () => assert.equal(gate(good, now).allowed,true));
for (const [name, patch, time] of [
 ['missing enable',{QA_ENABLED:undefined}], ['false enable',{QA_ENABLED:'false'}], ['wrong case',{QA_ENABLED:'TRUE'}],
 ['missing start',{QA_STARTED_AT:undefined}], ['missing expiry',{QA_EXPIRES_AT:undefined}],
 ['bad expiry',{QA_EXPIRES_AT:'bad'}], ['non UTC',{QA_EXPIRES_AT:'2026-10-14T03:00:00+00:00'}],
 ['invalid calendar',{QA_EXPIRES_AT:'2026-02-30T03:00:00Z'}],
 ['expired',{}, now+86400000], ['future start',{QA_STARTED_AT:'2026-10-13T04:00:00Z'}],
 ['over 24h',{QA_EXPIRES_AT:'2026-10-14T03:00:01Z'}], ['inverted',{QA_EXPIRES_AT:'2026-10-12T03:00:00Z'}],
 ['invalid clock',{},NaN]
]) test(name,()=>assert.equal(gate({...good,...patch},time===undefined?now:time).allowed,false));
