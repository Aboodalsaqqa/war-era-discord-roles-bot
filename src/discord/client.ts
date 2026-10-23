import { Client, GatewayIntentBits, Events, REST, Routes, Interaction } from 'discord.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { rateLimitTracker } from './rateLimitTracker';

// Repositories
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { MuRoleRepository } from '../repositories/muRole.repository';
import { LevelRoleRepository } from '../repositories/levelRole.repository';
import { UserLinkRepository } from '../repositories/userLink.repository';

// Services
import { WarEraClient } from '../warera/client';
import { WarEraService } from '../warera/service';
import { GuildConfigService } from '../services/guildConfig.service';
import { MuRoleService } from '../services/muRole.service';
import { RoleSyncService } from '../services/roleSync.service';
import { VerificationService } from '../services/verification.service';
import { RecruitmentService } from '../services/recruitment.service';
import { OperationService } from '../services/operation.service';
import { ReadinessService } from '../services/readiness.service';
import { VerificationManagementService } from '../services/verificationManagement.service';

// Commands
import { UserCommands } from '../commands/user.commands';
import { AdminCommands } from '../commands/admin.commands';
import { ConfigCommands } from '../commands/config.commands';
import { RecruitmentCommands } from '../commands/recruitment.commands';
import { OperationCommands } from '../commands/operation.commands';
import { ReadinessCommands } from '../commands/readiness.commands';
import { VerificationManagementCommands } from '../commands/verificationManagement.commands';
import { AuditCommands } from '../commands/audit.commands';
import { OptimizeCommands } from '../commands/optimize.commands';
import { CommandRouter, getSlashCommandsDefinition } from '../commands';

// Jobs
import { startSyncJob } from '../jobs/sync.job';
import { startRecruitmentReminderJob } from '../jobs/recruitmentReminder.job';

export async function initDiscordBot(): Promise<Client> {
  logger.info('Initializing Discord bot client with MoD extensions...');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
    rest: {
      timeout: 15000, // 15s request timeout (standard resilient timeout)
      retries: 2,     // 2 retries on network failures
    },
  });

  // REST client rate-limit and response monitoring
  client.rest.on('rateLimited', (rateLimitInfo) => {
    rateLimitTracker.recordRateLimit({
      path: rateLimitInfo.route,
      retryAfterMs: rateLimitInfo.timeToReset,
      scope: rateLimitInfo.scope,
      isGlobal: rateLimitInfo.global,
      limit: rateLimitInfo.limit,
    });
    logger.warn(
      {
        global: rateLimitInfo.global,
        method: rateLimitInfo.method,
        url: rateLimitInfo.url,
        route: rateLimitInfo.route,
        timeToReset: rateLimitInfo.timeToReset,
        limit: rateLimitInfo.limit,
        sublimitTimeout: rateLimitInfo.sublimitTimeout,
        scope: rateLimitInfo.scope,
      },
      `[DISCORD_REST] Rate limit encountered on route ${rateLimitInfo.route} (waiting ${rateLimitInfo.timeToReset}ms, scope: ${rateLimitInfo.scope})`
    );
  });

  client.rest.on('restDebug', (info: string) => {
    if (info.includes('429') || info.includes('rate limit') || info.includes('Waiting') || info.includes('Global')) {
      logger.warn({ restDebug: info }, '[DISCORD_REST] Rate limit activity');
    } else {
      logger.debug({ restDebug: info }, '[DISCORD_REST_DEBUG]');
    }
  });

  client.rest.on('invalidRequestWarning', (warningInfo) => {
    logger.warn(
      {
        count: warningInfo.count,
        remainingTime: warningInfo.remainingTime,
      },
      '[DISCORD_REST] Invalid request warning received from Discord'
    );
  });

  client.rest.on('response', async (request, response) => {
    const is429 = response.status === 429;
    const isError = response.status >= 400;

    if (is429) {
      const retryAfterHeader = response.headers?.get?.('retry-after') ?? null;
      const scope = response.headers?.get?.('x-ratelimit-scope') ?? null;
      const isGlobal = response.headers?.get?.('x-ratelimit-global') === 'true';
      const limit = response.headers?.get?.('x-ratelimit-limit') ?? null;
      const remaining = response.headers?.get?.('x-ratelimit-remaining') ?? null;
      const reset = response.headers?.get?.('x-ratelimit-reset') ?? null;
      const resetAfter = response.headers?.get?.('x-ratelimit-reset-after') ?? null;
      const bucket = response.headers?.get?.('x-ratelimit-bucket') ?? null;
      const via = response.headers?.get?.('via') ?? null;
      const cfRay = response.headers?.get?.('cf-ray') ?? null;

      let responseBody: unknown = null;
      try {
        const respAny = response as unknown as { clone?: () => { text: () => Promise<string> } };
        if (typeof respAny.clone === 'function') {
          const text = await respAny.clone().text();
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody = text.slice(0, 500);
          }
        }
      } catch (cloneErr) {
        responseBody = `[Clone failed: ${(cloneErr as Error).message}]`;
      }

      // Calculate retry delay in milliseconds
      let retryAfterMs = 5000;
      if (retryAfterHeader) {
        const parsed = parseFloat(retryAfterHeader);
        if (!isNaN(parsed)) retryAfterMs = Math.ceil(parsed * 1000);
      } else if (responseBody && typeof responseBody === 'object' && 'retry_after' in responseBody) {
        const bodyRetry = (responseBody as { retry_after: number }).retry_after;
        if (typeof bodyRetry === 'number') retryAfterMs = Math.ceil(bodyRetry * 1000);
      }

      rateLimitTracker.recordRateLimit({
        path: request.path,
        retryAfterMs,
        scope,
        isGlobal,
        limit: limit ? Number(limit) : null,
        remaining: remaining ? Number(remaining) : null,
        resetAfter: resetAfter ? Number(resetAfter) : null,
        bucket,
        via,
        cfRay,
        responseBody,
      });

      logger.warn(
        {
          method: request.method,
          path: request.path,
          status: response.status,
          retryAfterHeader,
          retryAfterMs,
          scope,
          isGlobal,
          limit,
          remaining,
          reset,
          resetAfter,
          bucket,
          via,
          cfRay,
          responseBody,
        },
        `[DISCORD_REST] Rate limit (HTTP 429) received on ${request.path} - sleeping for ${retryAfterMs}ms (scope: ${scope ?? 'unknown'}, global: ${isGlobal})`
      );
      return;
    }

    if (isError) {
      logger.warn(
        {
          method: request.method,
          path: request.path,
          status: response.status,
        },
        '[DISCORD_REST] HTTP non-2xx response received'
      );
    } else {
      logger.info(
        {
          method: request.method,
          path: request.path,
          status: response.status,
        },
        '[DISCORD_REST] HTTP response received'
      );
    }
  });

  // Gateway debug listener with credential redaction
  client.on(Events.Debug, (message) => {
    const sanitized = message.replace(
      /(mfa\.[a-z0-9_-]+|bot\s+[a-z0-9_.-]+|[a-z0-9_-]{24,}\.[a-z0-9_-]{6,}\.[a-z0-9_-]{27,})/gi,
      '[REDACTED_TOKEN]'
    );
    if (
      sanitized.includes('[WS =>') ||
      sanitized.includes('Preparing to connect') ||
      sanitized.includes('Heartbeat') ||
      sanitized.includes('Identif') ||
      sanitized.includes('Ready') ||
      sanitized.includes('Resume')
    ) {
      logger.info({ gateway: sanitized }, '[DISCORD_GATEWAY]');
    } else {
      logger.debug({ gateway: sanitized }, '[DISCORD_GATEWAY_DEBUG]');
    }
  });

  // Gateway client and shard error/lifecycle monitoring
  client.on(Events.ShardReady, (shardId) => {
    logger.info({ shardId }, '[DISCORD_CLIENT] Shard ready');
  });

  client.on(Events.Error, (error) => {
    logger.error({ error: error.message, name: error.name }, '[DISCORD_CLIENT] Gateway client error');
  });

  client.on(Events.Warn, (warning) => {
    logger.warn({ warning }, '[DISCORD_CLIENT] Gateway client warning');
  });

  client.on(Events.ShardError, (error, shardId) => {
    logger.error({ error: error.message, shardId }, '[DISCORD_CLIENT] Gateway shard error');
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    logger.warn({ code: event.code, reason: event.reason, shardId }, '[DISCORD_CLIENT] Gateway shard disconnected');
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, '[DISCORD_CLIENT] Gateway shard reconnecting');
  });

  client.on(Events.ShardResume, (replayedEvents, shardId) => {
    logger.info({ replayedEvents, shardId }, '[DISCORD_CLIENT] Gateway shard resumed');
  });

  // 1. Dependency Injection Setup
  const wareraClient = new WarEraClient();
  const wareraService = new WarEraService(wareraClient);

  const guildConfigRepo = new GuildConfigRepository();
  const muRoleRepo = new MuRoleRepository();
  const levelRoleRepo = new LevelRoleRepository();
  const userLinkRepo = new UserLinkRepository();

  const guildConfigService = new GuildConfigService(guildConfigRepo);
  const muRoleService = new MuRoleService(muRoleRepo, wareraService);
  const roleSyncService = new RoleSyncService(
    guildConfigRepo,
    muRoleRepo,
    levelRoleRepo,
    userLinkRepo,
    wareraService
  );
  const verificationService = new VerificationService(userLinkRepo, wareraService);
  
  // New MoD Services
  const recruitmentService = new RecruitmentService(wareraService);
  const operationService = new OperationService(wareraService);
  const readinessService = new ReadinessService(wareraService, recruitmentService);
  const verificationManagementService = new VerificationManagementService(guildConfigRepo, wareraService);

  // Command handlers
  const userCommands = new UserCommands(verificationService, roleSyncService, wareraService);
  const adminCommands = new AdminCommands(
    verificationService,
    roleSyncService,
    userLinkRepo,
    guildConfigRepo,
    muRoleRepo,
    levelRoleRepo
  );
  const configCommands = new ConfigCommands(guildConfigService, muRoleService, levelRoleRepo);
  
  // New MoD Command handlers
  const recruitmentCommands = new RecruitmentCommands(recruitmentService, guildConfigRepo);
  const operationCommands = new OperationCommands(operationService, guildConfigRepo);
  const readinessCommands = new ReadinessCommands(readinessService, guildConfigRepo);
  const verificationManagementCommands = new VerificationManagementCommands(verificationManagementService, guildConfigRepo);
  const auditCommands = new AuditCommands(muRoleRepo, wareraService);
  const optimizeCommands = new OptimizeCommands();

  const commandRouter = new CommandRouter(
    userCommands,
    adminCommands,
    configCommands,
    recruitmentCommands,
    operationCommands,
    readinessCommands,
    verificationManagementCommands,
    auditCommands,
    optimizeCommands
  );

  // 2. Events Setup
  client.once(Events.ClientReady, async (readyClient) => {
    const guilds = readyClient.guilds.cache;

    // Checkpoint 3: Discord ready event fires
    logger.info(
      {
        event: 'CHECKPOINT_3_READY',
        tag: readyClient.user.tag,
        botId: readyClient.user.id,
        configuredClientId: config.discordClientId,
        clientIdMatch: readyClient.user.id === config.discordClientId,
        guildCount: guilds.size,
        guilds: guilds.map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount })),
      },
      `[CHECKPOINT_3_READY] Discord Bot is logged in and ready as ${readyClient.user.tag}`
    );

    // Register slash commands
    try {
      const rest = new REST({ version: '10' }).setToken(config.discordToken);
      const commandsBody = getSlashCommandsDefinition();
      
      logger.info(`Registering ${commandsBody.length} application (/) commands...`);

      for (const [guildId, guild] of guilds) {
        logger.info(`Registering commands instantly for guild: ${guild.name} (${guildId})`);
        await rest.put(
          Routes.applicationGuildCommands(config.discordClientId, guildId),
          { body: commandsBody }
        );
      }
      
      logger.info(`Successfully registered ${commandsBody.length} commands across ${guilds.size} guild(s).`);
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Failed to register slash commands');
    }

    // Start sync cron job (hourly)
    startSyncJob(readyClient, roleSyncService, userLinkRepo);

    // Start recruitment reminders cron job (daily)
    startRecruitmentReminderJob(readyClient, wareraService, recruitmentService);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // Check for button interactions (Operation Available/Unavailable answers)
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('op_avail_') || customId.startsWith('op_unavail_')) {
        try {
          const operationId = customId.split('_').pop()!;
          const responseType = customId.startsWith('op_avail_') ? 'available' : 'unavailable';
          
          await operationService.recordResponse(operationId, interaction.user.id, responseType);
          await interaction.reply({
            content: `✅ Your availability has been recorded as **${responseType === 'available' ? 'Available' : 'Unavailable'}**. Thank you!`,
            ephemeral: true,
          });
        } catch (err) {
          logger.error({ error: (err as Error).message }, 'Failed to record operation response');
          await interaction.reply({
            content: '❌ Failed to save your response. Please try again.',
            ephemeral: true,
          }).catch((replyErr) => {
            logger.error({ error: (replyErr as Error).message }, 'Failed to send button error reply');
          });
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    // Checkpoint 4: interactionCreate receives the command
    const correlationId = `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.info(
      {
        event: 'CHECKPOINT_4_INTERACTION_RECEIVED',
        correlationId,
        commandName: interaction.commandName,
        interactionId: interaction.id,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        guildId: interaction.guildId ?? 'dm',
        channelId: interaction.channelId,
      },
      `[CHECKPOINT_4_INTERACTION_RECEIVED] Received slash command /${interaction.commandName}`
    );

    try {
      await commandRouter.handleInteraction(interaction, correlationId);
    } catch (err) {
      logger.error(
        {
          correlationId,
          error: (err as Error).message,
          commandName: interaction.commandName,
          userId: interaction.user.id,
          deferred: interaction.deferred,
          replied: interaction.replied,
        },
        'Unhandled error in command router'
      );
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: '❌ An unexpected error occurred.' }).catch((editErr) => {
          logger.error({ correlationId, error: (editErr as Error).message }, 'Failed to send editReply on error');
        });
      } else if (interaction.replied) {
        await interaction.followUp({ content: '❌ An unexpected error occurred.', ephemeral: true }).catch((fuErr) => {
          logger.error({ correlationId, error: (fuErr as Error).message }, 'Failed to send followUp on error');
        });
      }
    }
  });

  // Login with dynamically bounded timeout:
  // If Discord issues a rate-limit Retry-After, dynamically extend timeout so @discordjs/rest
  // can complete its legitimate sleep and retry without premature process abort.
  const DEFAULT_LOGIN_TIMEOUT_MS = 45000;
  const loginStart = Date.now();
  const loginPromise = client.login(config.discordToken);

  let checkTimer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    checkTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - loginStart;
      const remainingCooldown = rateLimitTracker.getRemainingCooldownMs();

      let effectiveTimeout = DEFAULT_LOGIN_TIMEOUT_MS;
      if (remainingCooldown > 0) {
        effectiveTimeout = Math.max(DEFAULT_LOGIN_TIMEOUT_MS, elapsed + remainingCooldown + 30000);
        logger.info(
          {
            elapsedMs: elapsed,
            remainingCooldownMs: remainingCooldown,
            effectiveTimeoutMs: effectiveTimeout,
            scope: rateLimitTracker.getState().lastScope,
          },
          '[DISCORD_CLIENT] Login wait dynamically extended to accommodate Discord rate-limit Retry-After'
        );
      }

      if (elapsed > effectiveTimeout) {
        if (checkTimer) clearInterval(checkTimer);
        reject(
          new Error(
            `Discord client login timed out after ${Math.round(elapsed / 1000)}s without establishing a ready session`
          )
        );
      }
    }, 5000);
  });

  try {
    logger.info('Attempting Discord client login...');
    await Promise.race([loginPromise, timeoutPromise]);
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to login to Discord');
    try {
      await client.destroy();
    } catch (destroyErr) {
      logger.error({ error: (destroyErr as Error).message }, 'Failed to destroy Discord client after login failure');
    }
    throw error;
  } finally {
    if (checkTimer) clearInterval(checkTimer);
  }

  return client;
}
