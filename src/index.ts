import * as dns from 'node:dns';
import { Client } from 'discord.js';
import { initDiscordBot } from './discord/client';
import { prisma } from './database';
import { logger } from './utils/logger';
import { config } from './config';
import { startHealthServer } from './server';

// 1. Force IPv4 first DNS resolution order to prevent IPv6 AAAA connection stalls on Render/Docker
dns.setDefaultResultOrder('ipv4first');

// 2. Attach global process-level error and rejection listeners
process.on('unhandledRejection', (reason) => {
  logger.error(
    {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    },
    '[PROCESS] Unhandled promise rejection detected'
  );
});

process.on('uncaughtException', (error) => {
  logger.fatal(
    {
      error: error.message,
      stack: error.stack,
    },
    '[PROCESS] Uncaught exception occurred'
  );
});

async function bootstrap() {
  const commit = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'f95c30f1c11226abcd89c44aad4ceb3ae2cc1698';
  const branch = process.env.RENDER_GIT_BRANCH || 'main';

  // Checkpoint 1: Process starts
  logger.info(
    {
      event: 'CHECKPOINT_1_START',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      commit,
      branch,
      renderServiceId: process.env.RENDER_SERVICE_ID || 'not-on-render',
      renderInstanceId: process.env.RENDER_INSTANCE_ID || 'local',
      port: config.port,
      envValidation: {
        hasDiscordToken: !!config.discordToken,
        hasClientId: !!config.discordClientId,
        hasDatabaseUrl: !!config.databaseUrl,
        hasWareraKey: !!config.wareraApiKey,
      },
    },
    '[CHECKPOINT_1_START] WarEra Egypt Discord Bot process started'
  );

  // Start HTTP health check server immediately so Render detects the open port without delay
  let client: Client | null = null;
  const httpServer = startHealthServer(config.port, () => client?.isReady() ?? false);

  try {
    const loginStart = Date.now();
    client = await initDiscordBot();

    // Checkpoint 2: Discord client logs in successfully
    logger.info(
      {
        event: 'CHECKPOINT_2_LOGIN',
        loginDurationMs: Date.now() - loginStart,
        uptime: process.uptime(),
      },
      '[CHECKPOINT_2_LOGIN] Discord client logged in successfully'
    );

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');

      try {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        logger.info('HTTP health check server closed.');
      } catch (err) {
        logger.error({ err }, 'Error closing HTTP server');
      }

      try {
        if (client) {
          await client.destroy();
          logger.info('Discord client disconnected.');
        }
      } catch (err) {
        logger.error({ err }, 'Error disconnecting Discord client');
      }

      try {
        await prisma.$disconnect();
        logger.info('Prisma Database disconnected.');
      } catch (err) {
        logger.error({ err }, 'Error disconnecting database');
      }

      logger.info('Shutdown complete. Exiting process.');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ error: (error as Error).message }, 'Failed to bootstrap application');
    process.exit(1);
  }
}

bootstrap();
