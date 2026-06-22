import cron from 'node-cron';
import { Client } from 'discord.js';
import { RoleSyncService } from '../services/roleSync.service';
import { UserLinkRepository } from '../repositories/userLink.repository';
import { logger } from '../utils/logger';

/**
 * Initializes and schedules the 6-hourly role synchronization job
 */
export function startSyncJob(
  client: Client,
  roleSyncService: RoleSyncService,
  userLinkRepo: UserLinkRepository
): cron.ScheduledTask {
  // Run every 6 hours: '0 */6 * * *'
  const task = cron.schedule('0 */6 * * *', async () => {
    logger.info('Auto-sync job: Started 6-hourly role synchronization');
    
    try {
      const allLinks = await userLinkRepo.listAll();
      if (allLinks.length === 0) {
        logger.info('Auto-sync job: No user links found in database. Skipping.');
        return;
      }

      logger.info({ linkedCount: allLinks.length }, 'Auto-sync job: Found linked users to sync');

      let processedCount = 0;
      let failedCount = 0;

      // Iterate through all mutual guilds and members
      for (const link of allLinks) {
        // Find mutual guilds where this user exists
        for (const [, guild] of client.guilds.cache) {
          try {
            const member = await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null);
            if (member) {
              await roleSyncService.syncMember(guild, member, link);
              processedCount++;
            }
          } catch (err) {
            failedCount++;
            logger.error(
              {
                guildId: guild.id,
                discordId: link.discordId,
                error: (err as Error).message,
              },
              'Auto-sync job: Failed to sync member roles'
            );
          }
        }
      }

      logger.info(
        { processedCount, failedCount },
        'Auto-sync job: Finished 6-hourly role synchronization'
      );
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'Auto-sync job: Critical error in 6-hourly synchronization workflow'
      );
    }
  });

  logger.info('Auto-sync job: 6-hourly role sync cron task scheduled successfully (0 */6 * * *)');
  return task;
}
