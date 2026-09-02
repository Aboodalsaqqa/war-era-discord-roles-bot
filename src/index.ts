import { initDiscordBot } from './discord/client';
import { prisma } from './database';
import { logger } from './utils/logger';
import { config } from './config';
import { startHealthServer } from './server';
import { Client } from 'discord.js';

async function bootstrap() {
  logger.info('Starting WarEra Egypt Discord Bot...');
  
  // 1. Start HTTP health check server immediately so Render detects the open port without delay
  let client: Client | null = null;
  const httpServer = startHealthServer(config.port, () => client?.isReady() ?? false);

  try {
    client = await initDiscordBot();

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
