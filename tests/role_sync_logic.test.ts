import assert from 'assert';
import {
  ALL_REGIMENT_ROLE_IDS,
  getQualifyingRegimentRoleIds,
  EDUCATION_LVL_1_ROLE_ID,
  EDUCATION_LVL_2_ROLE_ID,
} from '../src/services/roleSync.service';
import { getDelayBetweenUsers, getRateLimitCooldownMs } from '../src/jobs/sync.job';

async function runRoleSyncLogicTests() {
  console.log('=== Running Role Sync & Corps Architecture Tests ===\n');

  // -------------------------------------------------------------
  // Test 1: Corps / Regiment Structure Mapping
  // -------------------------------------------------------------
  console.log('Test 1: Verify Regiment qualification based on Unit role IDs');
  assert(ALL_REGIMENT_ROLE_IDS.length === 5, `Expected 5 regiment role IDs, got ${ALL_REGIMENT_ROLE_IDS.length}`);

  // Anubis 1st Regiment unit (EGY STRIKE: 1490125587371528272)
  const anubis1stUnit = '1490125587371528272';
  const roles1 = new Set([anubis1stUnit]);
  const res1 = getQualifyingRegimentRoleIds((id) => roles1.has(id));
  assert(res1.includes('1550569383691288686'), 'Should qualify for Anubis 1st Regiment (1550569383691288686)');
  assert.strictEqual(res1.length, 1);

  // Kemet 1st Regiment unit (EG 3ASQLAN ARMY: 1455696658200526930)
  const kemet1stUnit = '1455696658200526930';
  const roles2 = new Set([anubis1stUnit, kemet1stUnit]);
  const res2 = getQualifyingRegimentRoleIds((id) => roles2.has(id));
  assert(res2.includes('1550569383691288686'), 'Should qualify for Anubis 1st');
  assert(res2.includes('1550569732854513795'), 'Should qualify for Kemet 1st (1550569732854513795)');
  assert.strictEqual(res2.length, 2, 'Member with units in 2 regiments should receive both');

  // Member with no unit roles
  const roles3 = new Set(['unrelated_role_1', 'unrelated_role_2']);
  const res3 = getQualifyingRegimentRoleIds((id) => roles3.has(id));
  assert.strictEqual(res3.length, 0, 'Member with no unit roles should qualify for 0 regiments');
  console.log('✔ Test 1 Passed: Regiment role qualification logic functions correctly.\n');

  // -------------------------------------------------------------
  // Test 2: Distributed Sync Pacing Calculation
  // -------------------------------------------------------------
  console.log('Test 2: Verify distributed hourly sync delay calculations');
  // For 282 users, 3600000 / 282 = ~12,765 ms
  const delayFor282 = getDelayBetweenUsers(282);
  assert(delayFor282 >= 12000 && delayFor282 <= 13000, `Delay for 282 users should be ~12.5s, got ${delayFor282}ms`);

  // Clamping test: large user count (e.g. 5000 users) clamps to minimum 2000ms
  const delayFor5000 = getDelayBetweenUsers(5000);
  assert.strictEqual(delayFor5000, 2000, 'Delay should clamp to 2000ms minimum');

  // Clamping test: small user count (e.g. 50 users) clamps to maximum 30000ms
  const delayFor50 = getDelayBetweenUsers(50);
  assert.strictEqual(delayFor50, 30000, 'Delay should clamp to 30000ms maximum');

  // Environment variable override test
  process.env.SYNC_DELAY_SECONDS = '15';
  assert.strictEqual(getDelayBetweenUsers(282), 15000, 'SYNC_DELAY_SECONDS override should take effect');
  delete process.env.SYNC_DELAY_SECONDS;

  process.env.SYNC_DELAY_MS = '7500';
  assert.strictEqual(getDelayBetweenUsers(282), 7500, 'SYNC_DELAY_MS override should take effect');
  delete process.env.SYNC_DELAY_MS;

  console.log('✔ Test 2 Passed: Distributed sync delay calculation and overrides behave as expected.\n');

  // -------------------------------------------------------------
  // Test 3: Rate Limit Cooldown Calculation
  // -------------------------------------------------------------
  console.log('Test 3: Verify rate limit cooldown duration & overrides');
  assert.strictEqual(getRateLimitCooldownMs(), 30000, 'Default rate limit cooldown should be 30,000ms');

  process.env.SYNC_429_COOLDOWN_MS = '45000';
  assert.strictEqual(getRateLimitCooldownMs(), 45000, 'SYNC_429_COOLDOWN_MS override should take effect');
  delete process.env.SYNC_429_COOLDOWN_MS;
  console.log('✔ Test 3 Passed: Rate limit cooldown calculations function correctly.\n');

  // -------------------------------------------------------------
  // Test 4: Education Role IDs Constant Verification
  // -------------------------------------------------------------
  console.log('Test 4: Verify Education role ID constants');
  assert.strictEqual(EDUCATION_LVL_1_ROLE_ID, '1525835773230710864');
  assert.strictEqual(EDUCATION_LVL_2_ROLE_ID, '1525836096351768616');
  assert.notStrictEqual(EDUCATION_LVL_1_ROLE_ID, EDUCATION_LVL_2_ROLE_ID, 'Education roles must be distinct');
  console.log('✔ Test 4 Passed: Education role constants verified.\n');

  console.log('===================================================');
  console.log('ALL ROLE SYNC & CORPS TESTS PASSED!');
  console.log('===================================================');
}

runRoleSyncLogicTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
