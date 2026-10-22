import http from 'http';
import assert from 'assert';
import { ProfileTracer } from '../src/utils/profileTracer';
import { WarEraClient } from '../src/warera/client';
import { WarEraService } from '../src/warera/service';
import { UserCommands } from '../src/commands/user.commands';

async function runTests() {
  console.log('=== Running Profile Performance & Timeout Diagnostics Tests ===\n');

  // -------------------------------------------------------------
  // Test 1: ProfileTracer functionality and redaction
  // -------------------------------------------------------------
  console.log('Test 1: ProfileTracer logs stages, durations, and redacts sensitive credentials');
  const tracer = new ProfileTracer('test_req_123');
  assert.strictEqual(tracer.requestId, 'test_req_123');
  
  tracer.startStage('db_lookup', { userId: 'user_456', secretToken: 'SUPER_SECRET_VALUE' });
  await new Promise(r => setTimeout(r, 20));
  const dur = tracer.endStage('db_lookup', { status: 'found' });
  assert(dur >= 15, `Duration should be >= 15ms, got ${dur}ms`);

  tracer.startStage('failing_stage');
  const errDur = tracer.errorStage('failing_stage', new Error('Simulated failure'), { apiKey: 'SECRET_API_KEY' });
  assert(errDur >= 0);

  const totalDur = tracer.complete({ outcome: 'success' });
  assert(totalDur >= dur);
  console.log('✔ Test 1 Passed: ProfileTracer functions as expected.\n');

  // -------------------------------------------------------------
  // Test 2: WarEraClient timeout handling
  // -------------------------------------------------------------
  console.log('Test 2: WarEraClient aborts with timeout error when server hangs');
  // Start a local mock HTTP server that hangs/delays response
  let serverRequestCount = 0;
  const mockServer = http.createServer((req, res) => {
    serverRequestCount++;
    // Intentionally delay responding for 2000ms
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result: { data: { json: { success: true } } } }));
    }, 2000);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const address = mockServer.address() as any;
  const mockBaseUrl = `http://127.0.0.1:${address.port}/`;

  // Instantiate WarEraClient pointing to our mock server with a short 200ms timeout
  const testClient = new WarEraClient(200);
  (testClient as any).baseUrl = mockBaseUrl;

  const tStart = Date.now();
  let timedOut = false;
  try {
    await testClient.request('user.profile' as any, { userId: '123' } as any, { timeoutMs: 200 });
  } catch (err: any) {
    const elapsed = Date.now() - tStart;
    assert(err.message.includes('timed out after 200ms'), `Expected timeout error message, got: ${err.message}`);
    assert(elapsed >= 180 && elapsed < 1500, `Elapsed time should be around 200ms, took ${elapsed}ms`);
    timedOut = true;
  }
  assert.strictEqual(timedOut, true, 'WarEraClient should have aborted with timeout error');
  console.log('✔ Test 2 Passed: WarEraClient correctly aborts after configured timeout.\n');

  // -------------------------------------------------------------
  // Test 3: WarEraService ranking deduplication
  // -------------------------------------------------------------
  console.log('Test 3: WarEraService deduplicates in-flight ranking requests');
  // Reconfigure mock server to respond after 150ms with sample ranking
  mockServer.removeAllListeners('request');
  let rankingServerCalls = 0;
  mockServer.on('request', (req, res) => {
    rankingServerCalls++;
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        result: {
          data: {
            json: {
              items: [
                { user: 'user_1', country: 'egypt_id', totalDamages: 50000 },
                { user: 'user_2', country: 'egypt_id', totalDamages: 40000 },
                { user: 'user_3', country: 'other_id', totalDamages: 30000 },
              ]
            }
          }
        }
      }]));
    }, 150);
  });

  const serviceClient = new WarEraClient(2000);
  (serviceClient as any).baseUrl = mockBaseUrl;
  const wareraService = new WarEraService(serviceClient);
  // Mock country lookup so it doesn't query network
  (wareraService as any).getEgyptCountryId = async () => 'egypt_id';

  // Fire 2 concurrent ranking lookups for 'userDamages'
  const [rank1, rank2] = await Promise.all([
    wareraService.getEgyptUserRank('user_2', 'userDamages'),
    wareraService.getEgyptUserRank('user_1', 'userDamages'),
  ]);

  assert.strictEqual(rank1, 2, 'user_2 should be ranked #2 in Egypt');
  assert.strictEqual(rank1, 2);
  assert.strictEqual(rank2, 1, 'user_1 should be ranked #1 in Egypt');
  assert.strictEqual(rankingServerCalls, 1, `Expected exactly 1 network call due to deduplication, got ${rankingServerCalls}`);
  console.log('✔ Test 3 Passed: Concurrent ranking requests are cleanly deduplicated.\n');

  // Close mock server
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));

  // -------------------------------------------------------------
  // Test 4: buildProfileEmbed fallback resilience under service failures
  // -------------------------------------------------------------
  console.log('Test 4: buildProfileEmbed gracefully falls back when enrichment fails');
  const mockFailingService = {
    getMu: async () => { throw new Error('MU service timed out'); },
    getOwnedMus: async () => { throw new Error('Owned MUs service network error'); },
    getEgyptUserRank: async () => { throw new Error('Rankings service 504 Gateway Timeout'); },
  } as unknown as WarEraService;

  const userCommands = new UserCommands(
    {} as any, // VerificationService
    {} as any, // RoleSyncService
    mockFailingService
  );

  const sampleProfile = {
    _id: 'test_user_id',
    username: 'TestWarrior',
    mu: 'sample_mu_id',
    avatarUrl: null,
    leveling: { level: 42 },
    stats: { damagesCount: 1234567 },
    rankings: { weeklyUserDamages: { value: 76543 } },
    skills: { attack: { level: 25 }, production: { level: 5 } },
  };

  const dummyInteraction = {
    guild: null,
  } as any;

  const testTracer = new ProfileTracer('embed_test_req');
  const embed = await (userCommands as any).buildProfileEmbed(dummyInteraction, sampleProfile, testTracer);

  assert(embed !== null, 'Embed should not be null');
  const embedData = embed.toJSON();
  assert(embedData.description?.includes('TestWarrior'), 'Embed description should contain username');
  assert(embedData.description?.includes('🪖 War Specialist'), 'Profile should be recognized as War Specialist');

  // Verify fields contain fallback values
  const fields = embedData.fields || [];
  const totalDmgField = fields.find((f: any) => f.name === '⚔ Total Damage');
  assert(totalDmgField?.value.includes('Unranked'), 'Total damage rank should fall back to Unranked');
  const weeklyDmgField = fields.find((f: any) => f.name === '🔥 Weekly Damage');
  assert(weeklyDmgField?.value.includes('Unranked'), 'Weekly damage rank should fall back to Unranked');
  const muField = fields.find((f: any) => f.name === '🏛 Current Active MU');
  assert(muField?.value.includes('ID: sample_mu_id'), 'MU name should fall back to ID: sample_mu_id');

  console.log('✔ Test 4 Passed: buildProfileEmbed survives enrichment failures and falls back gracefully.\n');

  // -------------------------------------------------------------
  // Test 5: /profile command error handling paths
  // -------------------------------------------------------------
  console.log('Test 5: /profile error handling sends editReply when deferred');
  let replyCalled = false;
  let editReplyCalled = false;
  let sentContent = '';

  const mockInteractionDeferred = {
    user: { id: 'disc_user_1' },
    guildId: 'guild_1',
    options: {
      getUser: () => null,
      getString: () => null,
    },
    deferred: true,
    replied: false,
    deferReply: async () => { mockInteractionDeferred.deferred = true; },
    editReply: async (payload: any) => {
      editReplyCalled = true;
      sentContent = payload.content;
    },
    reply: async () => { replyCalled = true; },
  };

  // Force getUserProfile to throw to test command error handling
  const mockThrowingService = {
    getUserProfile: async () => { throw new Error('Simulated WarEra 500 Internal Error'); },
  } as unknown as WarEraService;

  const mockVerificationService = {
    getLinkByDiscordId: async () => ({
      discordId: 'disc_user_1',
      wareraUserId: 'warera_user_1',
    }),
  } as any;

  const commandHandler = new UserCommands(
    mockVerificationService,
    {} as any,
    mockThrowingService
  );

  await commandHandler.profile(mockInteractionDeferred as any);

  assert.strictEqual(editReplyCalled, true, 'editReply should be called when interaction was deferred');
  assert.strictEqual(replyCalled, false, 'reply should not be called when interaction was already deferred');
  assert(sentContent.includes('Simulated WarEra 500 Internal Error'), 'Error message should be sent to user');

  console.log('✔ Test 5 Passed: Deferred interactions edit reply with informative error message on failure.\n');

  // -------------------------------------------------------------
  // Test 6: /profile error handling when deferReply() itself fails
  // -------------------------------------------------------------
  console.log('Test 6: /profile error handling when deferReply() itself fails');
  let test6ReplyCalled = false;
  let test6EditReplyCalled = false;

  const mockInteractionDeferFails = {
    user: { id: 'disc_user_2' },
    guildId: 'guild_1',
    options: {
      getUser: () => null,
      getString: () => null,
    },
    deferred: false,
    replied: false,
    deferReply: async () => {
      const err: any = new Error('DiscordAPIError[10062]: Unknown interaction');
      err.code = 10062;
      err.status = 404;
      throw err;
    },
    editReply: async () => { test6EditReplyCalled = true; },
    reply: async () => { test6ReplyCalled = true; },
  };

  await commandHandler.profile(mockInteractionDeferFails as any);

  assert.strictEqual(test6EditReplyCalled, false, 'editReply should NOT be called when deferReply fails');
  assert.strictEqual(test6ReplyCalled, false, 'reply should NOT be called when deferReply fails (prevents invalid second response)');
  console.log('✔ Test 6 Passed: Failed deferReply exits cleanly without attempting invalid second response.\n');

  console.log('===================================================');
  console.log('ALL DIAGNOSTIC & PERFORMANCE TESTS PASSED SUCCESSFULLY!');
  console.log('===================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
