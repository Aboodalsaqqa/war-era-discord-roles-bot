import assert from 'assert';
import { PermissionFlagsBits } from 'discord.js';
import {
  AdminCommands,
  FORCE_VERIFY_AUTHORIZED_ROLE_ID,
  FORCE_VERIFY_MODERATOR_ROLE_ID,
  FORCE_VERIFY_EDUCATION_STAFF_ROLE_ID,
} from '../src/commands/admin.commands';

async function runTests() {
  console.log('=== Running /forceverify Permission Logic Tests ===\n');

  // Verify constant role ID
  assert.strictEqual(
    FORCE_VERIFY_AUTHORIZED_ROLE_ID,
    '1496865174920101970',
    'FORCE_VERIFY_AUTHORIZED_ROLE_ID must match 1496865174920101970'
  );

  const mockVerificationService = {
    startVerification: async () => ({
      status: 'success',
      profile: { username: 'TargetWarPlayer', leveling: { level: 20 } },
      userLink: { discordId: 'target_123', wareraUserId: 'w_123' },
    }),
  } as any;

  const mockRoleSyncService = {
    syncMember: async () => {},
  } as any;

  const mockGuildConfigRepo = {
    getByGuildId: async (guildId: string) => ({
      guildId,
      officerRoleId: 'configured_officer_role_999',
    }),
  } as any;

  const adminCommands = new AdminCommands(
    mockVerificationService,
    mockRoleSyncService,
    {} as any,
    mockGuildConfigRepo,
    {} as any,
    {} as any
  );

  // Helper to build a mock interaction
  const createMockInteraction = (options: {
    inGuild?: boolean;
    isAdmin?: boolean;
    roleIds?: string[];
    memberPermissionsAdmin?: boolean;
  }) => {
    let replied = false;
    let deferred = false;
    let replyPayload: any = null;
    let editReplyPayload: any = null;

    const roleCache = new Map<string, any>();
    (options.roleIds || []).forEach((id) => roleCache.set(id, { id }));

    const guild = options.inGuild !== false
      ? {
          id: 'test_guild_1',
          members: {
            fetch: async () => ({
              id: 'target_123',
            }),
          },
        }
      : null;

    const member = {
      id: 'invoker_user_1',
      permissions: {
        has: (bit: any) => (options.isAdmin && bit === PermissionFlagsBits.Administrator),
      },
      roles: {
        cache: roleCache,
      },
      _roles: options.roleIds || [],
    };

    const interaction: any = {
      guild,
      guildId: guild ? guild.id : null,
      user: { id: 'invoker_user_1' },
      member,
      memberPermissions: options.memberPermissionsAdmin
        ? { has: (bit: any) => bit === PermissionFlagsBits.Administrator }
        : null,
      options: {
        getUser: () => ({ id: 'target_123' }),
        getString: () => 'TargetWarPlayer',
      },
      reply: async (p: any) => {
        replied = true;
        replyPayload = p;
      },
      deferReply: async (p: any) => {
        deferred = true;
      },
      editReply: async (p: any) => {
        editReplyPayload = p;
      },
      followUp: async (p: any) => {},
    };

    return {
      interaction,
      getReplied: () => replied,
      getDeferred: () => deferred,
      getReplyPayload: () => replyPayload,
      getEditReplyPayload: () => editReplyPayload,
    };
  };

  // -------------------------------------------------------------
  // Test 1: User with authorized role 1496865174920101970
  // -------------------------------------------------------------
  console.log('Test 1: Member with role ID 1496865174920101970 is allowed to execute /forceverify');
  const t1 = createMockInteraction({ roleIds: ['1496865174920101970'] });
  await adminCommands.forceVerify(t1.interaction);
  assert.strictEqual(t1.getReplied(), false, 'Should not be denied with direct reply');
  assert.strictEqual(t1.getDeferred(), true, 'Should proceed to deferReply and execution');
  console.log('✔ Test 1 Passed: Role 1496865174920101970 successfully authorized.\n');

  // -------------------------------------------------------------
  // Test 2: Administrator member
  // -------------------------------------------------------------
  console.log('Test 2: Administrator is allowed to execute /forceverify');
  const t2 = createMockInteraction({ isAdmin: true });
  await adminCommands.forceVerify(t2.interaction);
  assert.strictEqual(t2.getReplied(), false, 'Administrator should not be denied');
  assert.strictEqual(t2.getDeferred(), true, 'Administrator should proceed to deferReply');
  console.log('✔ Test 2 Passed: Administrator successfully authorized.\n');

  // -------------------------------------------------------------
  // Test 3: Moderator role
  // -------------------------------------------------------------
  console.log('Test 3: Moderator role is allowed to execute /forceverify');
  const t3 = createMockInteraction({ roleIds: [FORCE_VERIFY_MODERATOR_ROLE_ID] });
  await adminCommands.forceVerify(t3.interaction);
  assert.strictEqual(t3.getReplied(), false, 'Moderator should not be denied');
  assert.strictEqual(t3.getDeferred(), true, 'Moderator should proceed to deferReply');
  console.log('✔ Test 3 Passed: Moderator role successfully authorized.\n');

  // -------------------------------------------------------------
  // Test 4: Education Staff role
  // -------------------------------------------------------------
  console.log('Test 4: Education Staff role is allowed to execute /forceverify');
  const t4 = createMockInteraction({ roleIds: [FORCE_VERIFY_EDUCATION_STAFF_ROLE_ID] });
  await adminCommands.forceVerify(t4.interaction);
  assert.strictEqual(t4.getReplied(), false, 'Education Staff should not be denied');
  assert.strictEqual(t4.getDeferred(), true, 'Education Staff should proceed to deferReply');
  console.log('✔ Test 4 Passed: Education Staff role successfully authorized.\n');

  // -------------------------------------------------------------
  // Test 5: Configured officer role
  // -------------------------------------------------------------
  console.log('Test 5: Configured Officer role is allowed to execute /forceverify');
  const t5 = createMockInteraction({ roleIds: ['configured_officer_role_999'] });
  await adminCommands.forceVerify(t5.interaction);
  assert.strictEqual(t5.getReplied(), false, 'Configured officer should not be denied');
  assert.strictEqual(t5.getDeferred(), true, 'Configured officer should proceed to deferReply');
  console.log('✔ Test 5 Passed: Configured officer role successfully authorized.\n');

  // -------------------------------------------------------------
  // Test 6: Unauthorized member without any allowed roles
  // -------------------------------------------------------------
  console.log('Test 6: Unauthorized member is denied with ephemeral error message');
  const t6 = createMockInteraction({ roleIds: ['random_role_111', 'random_role_222'] });
  await adminCommands.forceVerify(t6.interaction);
  assert.strictEqual(t6.getReplied(), true, 'Unauthorized member should receive reply');
  assert.strictEqual(t6.getDeferred(), false, 'Unauthorized member must NOT reach deferReply');
  const replyPayload = t6.getReplyPayload();
  assert.strictEqual(replyPayload.ephemeral, true, 'Error message must be ephemeral');
  assert(replyPayload.content.includes('❌ You do not have permission'), 'Error message should clearly state permission failure');
  console.log('✔ Test 6 Passed: Unauthorized member rejected with clear ephemeral message.\n');

  // -------------------------------------------------------------
  // Test 7: Direct APIInteractionGuildMember array representation
  // -------------------------------------------------------------
  console.log('Test 7: Direct raw roles array (APIInteractionGuildMember) authorizes role 1496865174920101970');
  const t7Interaction: any = {
    guild: { id: 'test_guild_1', members: { fetch: async () => ({ id: 'target_123' }) } },
    guildId: 'test_guild_1',
    user: { id: 'invoker_user_2' },
    member: {
      roles: ['1496865174920101970', 'unrelated_role'],
      permissions: { has: () => false },
    },
    options: {
      getUser: () => ({ id: 'target_123' }),
      getString: () => 'TargetWarPlayer',
    },
    reply: async () => {},
    deferReply: async () => {},
    editReply: async () => {},
    followUp: async () => {},
  };
  let deferredT7 = false;
  t7Interaction.deferReply = async () => { deferredT7 = true; };
  await adminCommands.forceVerify(t7Interaction);
  assert.strictEqual(deferredT7, true, 'APIInteractionGuildMember with raw roles array should be authorized');
  console.log('✔ Test 7 Passed: Raw roles array representation properly parsed and authorized.\n');

  console.log('===================================================');
  console.log('ALL /forceverify PERMISSION TESTS PASSED SUCCESSFULLY!');
  console.log('===================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
