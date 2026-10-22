import assert from 'assert';
import { getSlashCommandsDefinition, CommandRouter } from '../src/commands';
import { PermissionFlagsBits } from 'discord.js';

async function runCommandLifecycleTests() {
  console.log('=== Running Full Command Routing & Lifecycle Test Suite ===\n');

  // -------------------------------------------------------------
  // Test 1: Command Registration Consistency
  // -------------------------------------------------------------
  console.log('Test 1: Verify all registered slash command definitions have corresponding routes');
  const commandDefs = getSlashCommandsDefinition();
  assert(commandDefs.length >= 17, `Expected at least 17 command definitions, got ${commandDefs.length}`);

  const registeredNames = new Set(commandDefs.map((c) => c.name));
  const expectedCommands = [
    'verify',
    'profile',
    'sync-me',
    'forceverify',
    'unverify',
    'sync',
    'sync-all',
    'config',
    'mu-role',
    'level-role',
    'recruitment',
    'operation',
    'readiness',
    'verified-list',
    'verified-export',
    'mu-audit',
    'optimize',
  ];

  for (const cmd of expectedCommands) {
    assert(registeredNames.has(cmd), `Missing command registration for: ${cmd}`);
  }
  console.log(`✔ Test 1 Passed: All ${expectedCommands.length} expected slash commands are registered.\n`);

  // -------------------------------------------------------------
  // Test 2: Mock Command Router Coverage
  // -------------------------------------------------------------
  console.log('Test 2: Verify CommandRouter dispatches to each command handler');
  const calledHandlers = new Set<string>();

  const mockUserCommands = {
    verify: async () => { calledHandlers.add('verify'); },
    profile: async () => { calledHandlers.add('profile'); },
    syncMe: async () => { calledHandlers.add('sync-me'); },
  } as any;

  const mockAdminCommands = {
    forceVerify: async () => { calledHandlers.add('forceverify'); },
    unVerify: async () => { calledHandlers.add('unverify'); },
    sync: async () => { calledHandlers.add('sync'); },
    syncAll: async () => { calledHandlers.add('sync-all'); },
  } as any;

  const mockConfigCommands = {
    configureRoles: async () => { calledHandlers.add('config'); },
    configureMuRoles: async () => { calledHandlers.add('mu-role'); },
    configureLevelRoles: async () => { calledHandlers.add('level-role'); },
  } as any;

  const mockRecruitmentCommands = {
    handleCommand: async () => { calledHandlers.add('recruitment'); },
  } as any;

  const mockOperationCommands = {
    handleCommand: async () => { calledHandlers.add('operation'); },
  } as any;

  const mockReadinessCommands = {
    handleCommand: async () => { calledHandlers.add('readiness'); },
  } as any;

  const mockVerificationManagementCommands = {
    handleListCommand: async () => { calledHandlers.add('verified-list'); },
    handleExportCommand: async () => { calledHandlers.add('verified-export'); },
  } as any;

  const mockAuditCommands = {
    muAudit: async () => { calledHandlers.add('mu-audit'); },
  } as any;

  const mockOptimizeCommands = {
    handleOptimize: async () => { calledHandlers.add('optimize'); },
  } as any;

  const router = new CommandRouter(
    mockUserCommands,
    mockAdminCommands,
    mockConfigCommands,
    mockRecruitmentCommands,
    mockOperationCommands,
    mockReadinessCommands,
    mockVerificationManagementCommands,
    mockAuditCommands,
    mockOptimizeCommands
  );

  for (const cmd of expectedCommands) {
    const mockInteraction: any = {
      commandName: cmd,
      user: { id: 'test_user_1' },
      reply: async () => {},
    };
    await router.handleInteraction(mockInteraction);
    assert(calledHandlers.has(cmd), `CommandRouter failed to dispatch command: ${cmd}`);
  }
  console.log(`✔ Test 2 Passed: CommandRouter successfully dispatched all ${expectedCommands.length} commands.\n`);

  // -------------------------------------------------------------
  // Test 3: Unknown Command Fallback Handling
  // -------------------------------------------------------------
  console.log('Test 3: Verify unrecognized command produces ephemeral error reply');
  let unknownReplyPayload: any = null;
  const unknownInteraction: any = {
    commandName: 'non-existent-cmd',
    user: { id: 'test_user_1' },
    reply: async (payload: any) => {
      unknownReplyPayload = payload;
    },
  };
  await router.handleInteraction(unknownInteraction);
  assert(unknownReplyPayload !== null, 'Unknown command should produce a reply');
  assert.strictEqual(unknownReplyPayload.ephemeral, true, 'Unknown command reply must be ephemeral');
  assert(unknownReplyPayload.content.includes('❌ Command not recognized.'), 'Should indicate unrecognized command');
  console.log('✔ Test 3 Passed: Unknown command safely handled with ephemeral rejection.\n');

  // -------------------------------------------------------------
  // Test 4: Guild-Required Commands Executed Outside Guild
  // -------------------------------------------------------------
  console.log('Test 4: Verify guild-only commands reject DM execution with ephemeral error');
  const { AdminCommands } = await import('../src/commands/admin.commands');
  const adminHandler = new AdminCommands({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  let dmReplyPayload: any = null;
  const dmInteraction: any = {
    guild: null,
    guildId: null,
    user: { id: 'dm_user_1' },
    options: {
      getUser: () => ({ id: 'target_1' }),
      getString: () => 'target_user',
    },
    reply: async (payload: any) => {
      dmReplyPayload = payload;
    },
  };

  await adminHandler.forceVerify(dmInteraction);
  assert(dmReplyPayload !== null);
  assert.strictEqual(dmReplyPayload.ephemeral, true);
  assert(dmReplyPayload.content.includes('inside a guild'), 'Should reject execution outside guild');
  console.log('✔ Test 4 Passed: Guild-required commands properly reject execution outside guilds.\n');

  // -------------------------------------------------------------
  // Test 5: HTTP Health Check & Read-Only API Server
  // -------------------------------------------------------------
  console.log('Test 5: Verify HTTP health check server and read-only API endpoint');
  const { startHealthServer } = await import('../src/server');
  let isReadyMock = false;

  const mockUserLinkRepo = {
    getByDiscordId: async (id: string) => {
      if (id === '123456789') {
        return { discordId: '123456789', wareraUserId: 'warera_user_found_123' };
      }
      return null;
    },
  };

  const server = startHealthServer({
    port: 0,
    isReady: () => isReadyMock,
    userLinkRepo: mockUserLinkRepo as any,
  });

  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.on('listening', resolve);
  });

  const port = (server.address() as any).port;
  const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return HTTP 200');
  const healthJson = await healthRes.json() as any;
  assert.strictEqual(healthJson.status, 'ok', 'Health status should be ok');
  assert.strictEqual(healthJson.discordReady, false);

  isReadyMock = true;
  const readyRes = await fetch(`http://127.0.0.1:${port}/health`);
  const readyJson = await readyRes.json() as any;
  assert.strictEqual(readyJson.discordReady, true, 'discordReady should reflect ready state');

  // Test read-only API endpoint: unlinked user returns null
  const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/v1/players/discord/999999999`);
  assert.strictEqual(notFoundRes.status, 200);
  const notFoundJson = await notFoundRes.json() as any;
  assert.strictEqual(notFoundJson.warEraUserId, null, 'Unlinked player should return null warEraUserId');

  // Test read-only API endpoint: linked user returns warEraUserId
  const foundRes = await fetch(`http://127.0.0.1:${port}/api/v1/players/discord/123456789`);
  assert.strictEqual(foundRes.status, 200);
  const foundJson = await foundRes.json() as any;
  assert.strictEqual(foundJson.warEraUserId, 'warera_user_found_123');

  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log('✔ Test 5 Passed: HTTP Health check & read-only API endpoints function correctly.\n');

  console.log('===================================================');
  console.log('ALL COMMAND ROUTING & LIFECYCLE TESTS PASSED!');
  console.log('===================================================');
}

runCommandLifecycleTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
