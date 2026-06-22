import { initDiscordBot } from './discord/client';
import { prisma } from './database';
import { logger } from './utils/logger';

async function bootstrap() {
  logger.info('Starting WarEra Egypt Discord Bot...');
  
  try {
    const client = await initDiscordBot();

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');
      
      try {
        await client.destroy();
        logger.info('Discord client disconnected.');
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
