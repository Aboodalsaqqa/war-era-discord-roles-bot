import cron from 'node-cron';
import { Client } from 'discord.js';
import { prisma } from '../database';
import { WarEraService } from '../warera/service';
import { RecruitmentService } from '../services/recruitment.service';
import { logger } from '../utils/logger';

/**
 * Initializes and schedules the daily recruitment reminder cron job
 */
export function startRecruitmentReminderJob(
  client: Client,
  wareraService: WarEraService,
  recruitmentService: RecruitmentService
): cron.ScheduledTask {
  // Run once per day at 12:00 PM: '0 12 * * *'
  const task = cron.schedule('0 12 * * *', async () => {
    logger.info('RecruitmentReminderJob: Started daily recruitment reminder checks');

    try {
      const egyptId = await wareraService.getEgyptCountryId();

      // Process each guild
      for (const [, guild] of client.guilds.cache) {
        const campaign = await recruitmentService.getActiveCampaign(guild.id);
        if (!campaign) {
          logger.debug({ guildId: guild.id }, 'RecruitmentReminderJob: No active recruitment campaign. Skipping guild.');
          continue;
        }

        const config = await prisma.guildConfig.findUnique({
          where: { guildId: guild.id },
        });

        // Fetch non-exempt users who haven't been reminded in the last 23 hours
        const cutoffTime = new Date(Date.now() - 23 * 60 * 60 * 1000);
        const usersToRemind = await prisma.userLink.findMany({
          where: {
            exemptFromRecruitment: false,
            OR: [
              { lastRecruitmentReminderAt: null },
              { lastRecruitmentReminderAt: { lt: cutoffTime } },
            ],
          },
        });

        logger.info(
          { guildId: guild.id, campaignId: campaign.id, candidateCount: usersToRemind.length },
          'RecruitmentReminderJob: Scanning candidates for recruitment alerts'
        );

        for (const link of usersToRemind) {
          try {
            // Verify they are in the guild
            const member = await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null);
            if (!member) continue;

            // Check citizen & trusted role requirements
            if (config) {
              const hasCitizen = config.citizenRoleId ? member.roles.cache.has(config.citizenRoleId) : true;
              const hasTrusted = config.trustedRoleId ? member.roles.cache.has(config.trustedRoleId) : true;
              if (!hasCitizen || !hasTrusted) {
                continue;
              }
            }

            // Fetch latest profile to check eligibility
            const profile = await wareraService.getUserProfile(link.wareraUserId);
            const level = profile.leveling?.level || 0;
            const belongsToEgypt = profile.country === egyptId;
            const spec = recruitmentService.getSpecialization(profile);

            if (belongsToEgypt && level >= campaign.minimumLevel && spec !== 'war') {
              const specLabel = spec === 'economy' ? 'Economy Specialist' : 'Hybrid';
              
              // Send DM
              const dmUser = await client.users.fetch(link.discordId).catch(() => null);
              if (dmUser) {
                await dmUser.send({
                  content: `🇪🇬 **Egypt Ministry of Defense**\n\nYou are eligible for military service.\n\n**Current Status:**\n- Level: \`${level}\` (Requirement: \`${campaign.minimumLevel}\`+)\n- Specialization: \`${specLabel}\`\n\n*Please switch your build to War specialization.*\n\nThis is an automated reminder.`,
                });

                // Update last recruitment reminder timestamp
                await prisma.userLink.update({
                  where: { id: link.id },
                  data: { lastRecruitmentReminderAt: new Date() },
                });

                logger.info(
                  { guildId: guild.id, discordId: link.discordId, wareraUsername: link.wareraUsername },
                  'RecruitmentReminderJob: Sent recruitment reminder DM'
                );
              }
            }
          } catch (userErr) {
            logger.error(
              { discordId: link.discordId, error: (userErr as Error).message },
              'RecruitmentReminderJob: Failed to check or remind user'
            );
          }
          // Delay send to respect rate limit (4 DMs per second max)
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      logger.info('RecruitmentReminderJob: Finished daily recruitment reminder checks');
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'RecruitmentReminderJob: Critical error in daily cron job'
      );
    }
  });

  logger.info('RecruitmentReminderJob: Daily recruitment cron task scheduled successfully (0 12 * * *)');
  return task;
}
