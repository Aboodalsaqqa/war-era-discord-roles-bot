import cron from 'node-cron';
import { Client } from 'discord.js';
import { RoleSyncService } from '../services/roleSync.service';
import { UserLinkRepository } from '../repositories/userLink.repository';
import { logger } from '../utils/logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Computes the delay (in ms) to wait between syncing consecutive users.
 * Can be overridden via SYNC_DELAY_MS or SYNC_DELAY_SECONDS environment variables.
 * If not explicitly set, dynamically distributes users across the hour (3600 seconds),
 * targeting roughly 12-13 seconds per user for ~280 users.
 */
export function getDelayBetweenUsers(userCount: number): number {
  if (process.env.SYNC_DELAY_MS) {
    const parsed = parseInt(process.env.SYNC_DELAY_MS, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  if (process.env.SYNC_DELAY_SECONDS) {
    const parsed = parseInt(process.env.SYNC_DELAY_SECONDS, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed * 1000;
    }
  }

  if (userCount <= 0) {
    return 12500;
  }

  // 1 hour = 3600 seconds = 3,600,000 ms
  // Distribute users evenly across the hour
  const calculatedDelay = Math.floor(3600000 / userCount);

  // Clamp between 2000ms (to prevent bursts) and 30000ms (if small user count)
  return Math.max(2000, Math.min(calculatedDelay, 30000));
}

/**
 * Returns cooldown duration in ms when WarEra API returns HTTP 429 Too Many Requests.
 * Configurable via SYNC_429_COOLDOWN_MS (defaults to 30,000ms).
 */
export function getRateLimitCooldownMs(): number {
  if (process.env.SYNC_429_COOLDOWN_MS) {
    const parsed = parseInt(process.env.SYNC_429_COOLDOWN_MS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 30000; // 30 seconds default
}

/**
 * Initializes and schedules the hourly role synchronization job
 */
export function startSyncJob(
  client: Client,
  roleSyncService: RoleSyncService,
  userLinkRepo: UserLinkRepository
): cron.ScheduledTask {
  // Configurable cron schedule, defaulting to every hour: '0 * * * *'
  const cronSchedule = process.env.SYNC_CRON_SCHEDULE || '0 * * * *';
  let isSyncRunning = false;

  const task = cron.schedule(cronSchedule, async () => {
    if (isSyncRunning) {
      logger.warn('Auto-sync job: Previous sync cycle is still running. Skipping this trigger to prevent overlap.');
      return;
    }

    isSyncRunning = true;
    const startTime = Date.now();

    try {
      const allLinks = await userLinkRepo.listAll();
      if (allLinks.length === 0) {
        logger.info('Auto-sync job: No user links found in database. Skipping.');
        return;
      }

      const delayMs = getDelayBetweenUsers(allLinks.length);
      const estimatedDurationMinutes = Number(((allLinks.length * delayMs) / 60000).toFixed(1));

      logger.info(
        {
          linkedCount: allLinks.length,
          delayMs,
          delaySeconds: Number((delayMs / 1000).toFixed(1)),
          estimatedDurationMinutes,
        },
        'Auto-sync job: Started hourly role synchronization (distributed pacing)'
      );

      let processedCount = 0;
      let failedCount = 0;
      let rateLimitHitCount = 0;

      // Process users sequentially, one at a time, spaced evenly throughout the hour
      for (let i = 0; i < allLinks.length; i++) {
        const link = allLinks[i];
        const progressStr = `${i + 1}/${allLinks.length}`;
        let isRateLimited = false;

        logger.debug(
          {
            progress: progressStr,
            discordId: link.discordId,
            wareraUsername: link.wareraUsername,
          },
          `Auto-sync job: Syncing user (${progressStr})`
        );

        // Find mutual guilds where this user exists
        for (const [, guild] of client.guilds.cache) {
          try {
            const member = await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null);
            if (member) {
              await roleSyncService.syncMember(guild, member, link);
              processedCount++;
              logger.info(
                {
                  progress: progressStr,
                  discordId: link.discordId,
                  wareraUsername: link.wareraUsername,
                  guildId: guild.id,
                },
                `Auto-sync job: Successfully synced user (${progressStr})`
              );
            } else {
              logger.debug(
                {
                  progress: progressStr,
                  discordId: link.discordId,
                  guildId: guild.id,
                },
                'Auto-sync job: Member not in guild, skipping'
              );
            }
          } catch (err) {
            failedCount++;
            const errorMessage = (err as Error).message || '';

            if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('too many requests')) {
              isRateLimited = true;
              rateLimitHitCount++;
              logger.warn(
                {
                  progress: progressStr,
                  guildId: guild.id,
                  discordId: link.discordId,
                  wareraUsername: link.wareraUsername,
                  error: errorMessage,
                },
                `Auto-sync job: WarEra API rate limit (HTTP 429) on user (${progressStr})`
              );
            } else {
              logger.error(
                {
                  progress: progressStr,
                  guildId: guild.id,
                  discordId: link.discordId,
                  wareraUsername: link.wareraUsername,
                  error: errorMessage,
                },
                `Auto-sync job: Failed to sync member roles (${progressStr})`
              );
            }
          }
        }

        // Apply delay before the next user (except after the final user)
        if (i < allLinks.length - 1) {
          if (isRateLimited) {
            const cooldownMs = getRateLimitCooldownMs();
            logger.warn(
              {
                progress: progressStr,
                cooldownMs,
                nextUserIndex: i + 2,
                totalUsers: allLinks.length,
              },
              `Auto-sync job: Pausing for ${cooldownMs / 1000}s rate-limit cooldown before next user`
            );
            await sleep(cooldownMs);
          } else {
            await sleep(delayMs);
          }
        }
      }

      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      logger.info(
        {
          totalUsers: allLinks.length,
          processedCount,
          failedCount,
          rateLimitHitCount,
          elapsedSeconds,
          elapsedMinutes: Number((elapsedSeconds / 60).toFixed(1)),
        },
        'Auto-sync job: Finished hourly role synchronization'
      );
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'Auto-sync job: Critical error in hourly synchronization workflow'
      );
    } finally {
      isSyncRunning = false;
    }
  });

  logger.info(`Auto-sync job: Hourly role sync cron task scheduled successfully (${cronSchedule})`);
  return task;
}
