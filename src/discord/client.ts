import { Client, GatewayIntentBits, Events, REST, Routes, Interaction } from 'discord.js';
import { config } from '../config';
import { logger } from '../utils/logger';

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
      timeout: 5000, // 5s request timeout (fast failure instead of 15s+ retries hanging)
      retries: 1,    // 1 retry max to prevent 30s+ retry cascades
    },
  });

  // REST client rate-limit and response monitoring
  client.rest.on('rateLimited', (rateLimitInfo) => {
    logger.warn(
      {
        global: rateLimitInfo.global,
        method: rateLimitInfo.method,
        url: rateLimitInfo.url,
        route: rateLimitInfo.route,
        timeToReset: rateLimitInfo.timeToReset,
        limit: rateLimitInfo.limit,
        sublimitTimeout: rateLimitInfo.sublimitTimeout,
      },
      '[DISCORD_REST] Rate limit encountered on Discord REST API'
    );
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

  client.rest.on('response', (request, response) => {
    logger.debug(
      {
        method: request.method,
        path: request.path,
        status: response.status,
      },
      '[DISCORD_REST] HTTP response received'
    );
  });

  // Gateway client and shard error/lifecycle monitoring
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

  // Login
  try {
    await client.login(config.discordToken);
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to login to Discord');
    throw error;
  }

  return client;
}
