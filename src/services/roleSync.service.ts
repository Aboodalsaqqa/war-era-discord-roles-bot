import { Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import { UserLink } from '@prisma/client';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { MuRoleRepository } from '../repositories/muRole.repository';
import { LevelRoleRepository } from '../repositories/levelRole.repository';
import { UserLinkRepository } from '../repositories/userLink.repository';
import { WarEraService } from '../warera/service';
import { logger } from '../utils/logger';
import { prisma } from '../database';

export class RoleSyncService {
  constructor(
    private readonly guildConfigRepo: GuildConfigRepository,
    private readonly muRoleRepo: MuRoleRepository,
    private readonly levelRoleRepo: LevelRoleRepository,
    private readonly userLinkRepo: UserLinkRepository,
    private readonly wareraService: WarEraService
  ) {}

  /**
   * Syncs roles for a single linked member in a specific guild
   */
  async syncMember(guild: Guild, memberParam: GuildMember, userLink: UserLink): Promise<void> {
    const logCtx = { guildId: guild.id, userId: memberParam.id, wareraUserId: userLink.wareraUserId };
    logger.info(logCtx, `Starting role sync for member ${memberParam.user.tag}`);

    try {
      // 0. Force-fetch the latest member object from Discord API to bypass caching issues
      let member = memberParam;
      try {
        member = await guild.members.fetch({ user: memberParam.id, force: true });
      } catch (fetchErr) {
        logger.warn(
          logCtx,
          `Failed to force-fetch latest member from Discord API, relying on cached member: ${(fetchErr as Error).message}`
        );
      }
      // 1. Get configurations
      const config = await this.guildConfigRepo.getByGuildId(guild.id);
      if (!config) {
        logger.warn(logCtx, 'No GuildConfig found for this guild, skipping role sync');
        return;
      }

      const muRoles = await this.muRoleRepo.listByGuild(guild.id);
      const levelRoles = await this.levelRoleRepo.listByGuild(guild.id);

      // 2. Fetch latest profile
      const profile = await this.wareraService.getUserProfile(userLink.wareraUserId);

      // 3. Update username in DB if changed
      if (profile.username !== userLink.wareraUsername) {
        logger.info(
          { ...logCtx, oldUsername: userLink.wareraUsername, newUsername: profile.username },
          'Updating WarEra username in database'
        );
        await this.userLinkRepo.upsertUserLink(
          userLink.discordId,
          userLink.wareraUserId,
          profile.username
        );
      }

      // 4. Determine all managed roles first
      const managedRoleIds = new Set<string>();
      const targetRoleIds = new Set<string>();

      // Country roles
      [
        config.presidentRoleId,
        config.vicePresidentRoleId,
        config.congressRoleId,
      ].forEach(id => { if (id) managedRoleIds.add(id); });

      // MU roles
      muRoles.forEach(r => managedRoleIds.add(r.discordRoleId));

      // Level roles
      levelRoles.forEach(r => managedRoleIds.add(r.discordRoleId));

      // Specialization roles
      [config.warRoleId, config.economyRoleId, config.hybridRoleId].forEach(id => {
        if (id) managedRoleIds.add(id);
      });

      // MU Leadership & No MU roles
      [config.muCommanderRoleId, config.muOwnerRoleId, config.noMuRoleId].forEach(id => {
        if (id) managedRoleIds.add(id);
      });

      // Check Citizen Role & Trusted Role status (both act as trust/verification checks).
      // These roles are assigned manually by server staff. They are NOT managed by the bot.
      // If the member lacks either role, synchronization stops entirely.
      const hasCitizen = config.citizenRoleId ? member.roles.cache.has(config.citizenRoleId) : true;
      const hasTrusted = config.trustedRoleId ? member.roles.cache.has(config.trustedRoleId) : true;
      const isTrusted = hasCitizen && hasTrusted;

      if (!isTrusted) {
        logger.info(logCtx, `Member ${member.user.tag} lacks the citizen or trusted role. All managed roles will be removed.`);
      } else {
        // --- Country Roles ---
        const egyptId = await this.wareraService.getEgyptCountryId();
        const belongsToEgypt = profile.country === egyptId;

        if (belongsToEgypt) {
          // Fetch Egypt Government info for presidency / congress
          try {
            const gov = await this.wareraService.getGovernment(egyptId);
            if (profile._id === gov.president && config.presidentRoleId) {
              targetRoleIds.add(config.presidentRoleId);
            }
            if (profile._id === gov.vicePresident && config.vicePresidentRoleId) {
              targetRoleIds.add(config.vicePresidentRoleId);
            }
            if (gov.congressMembers && gov.congressMembers.includes(profile._id) && config.congressRoleId) {
              targetRoleIds.add(config.congressRoleId);
            }
          } catch (govError) {
            logger.error(
              { ...logCtx, error: (govError as Error).message },
              'Failed to fetch government details during role sync'
            );
          }
        }

        // --- MU Roles ---
        if (profile.mu) {
          const muMapping = muRoles.find(m => m.muId === profile.mu);
          if (muMapping) {
            targetRoleIds.add(muMapping.discordRoleId);
          }
        }

        // --- Level Roles ---
        const userLevel = profile.leveling?.level || 0;
        const matchingLevelRoles = levelRoles.filter(lr => userLevel >= lr.minimumLevel);
        if (matchingLevelRoles.length > 0) {
          const highestMatching = matchingLevelRoles.reduce((max, current) => 
            current.minimumLevel > max.minimumLevel ? current : max
          );
          targetRoleIds.add(highestMatching.discordRoleId);
        }

        // --- Specialization Roles ---
        const skills = profile.skills || {};
        
        const warScore =
          (skills.attack?.level || 0) +
          (skills.precision?.level || 0) +
          (skills.criticalChance?.level || 0) +
          (skills.criticalDamages?.level || 0) +
          (skills.armor?.level || 0) +
          (skills.dodge?.level || 0) +
          (skills.lootChance?.level || 0);

        const economyScore =
          (skills.production?.level || 0) +
          (skills.management?.level || 0) +
          (skills.entrepreneurship?.level || 0) +
          (skills.companies?.level || 0);

        let targetSpecRoleId: string | null = null;
        if (warScore >= economyScore * 1.5) {
          targetSpecRoleId = config.warRoleId;
        } else if (economyScore >= warScore * 1.5) {
          targetSpecRoleId = config.economyRoleId;
        } else {
          targetSpecRoleId = config.hybridRoleId;
        }

        if (targetSpecRoleId) {
          targetRoleIds.add(targetSpecRoleId);
        }

        // --- MU Leadership & No MU Roles ---
        if (profile.mu) {
          try {
            const muDetails = await this.wareraService.getMu(profile.mu);
            const isOwner = profile._id === muDetails.user;
            const isCommander = muDetails.roles?.commanders?.includes(profile._id) || false;

            if (isOwner && config.muOwnerRoleId) {
              targetRoleIds.add(config.muOwnerRoleId);
            } else if (isCommander && config.muCommanderRoleId) {
              targetRoleIds.add(config.muCommanderRoleId);
            }
          } catch (muErr) {
            logger.error(
              { ...logCtx, muId: profile.mu, error: (muErr as Error).message },
              'Failed to fetch MU details for commander/owner check during role sync'
            );
          }
        } else {
          if (config.noMuRoleId) {
            targetRoleIds.add(config.noMuRoleId);
          }
        }

        // Recruitment Completion Detection: transition to War Specialist
        if (config.warRoleId) {
          const previouslyWasNotWar = !member.roles.cache.has(config.warRoleId);
          const nowIsWar = targetSpecRoleId === config.warRoleId;

          if (previouslyWasNotWar && nowIsWar) {
            try {
              const activeCampaign = await prisma.recruitmentCampaign.findFirst({
                where: { guildId: guild.id, active: true },
              });
              if (activeCampaign) {
                await member.send({
                  content: `✅ **Thank you for joining the Egyptian military.**\n\nYou are now registered as a War Specialist.\n\n*Future recruitment reminders for this campaign have been stopped for you.*`,
                }).catch(() => null);
                logger.info({ userId: member.id }, 'Recruitment completion DM sent successfully');
              }
            } catch (campaignErr) {
              logger.error({ error: (campaignErr as Error).message }, 'Failed during recruitment completion check');
            }
          }
        }
      }

      // 5. Clean up missing roles from Discord cache
      // If a role doesn't exist in the guild, we should not attempt to manage it.
      for (const roleId of managedRoleIds) {
        if (!guild.roles.cache.has(roleId)) {
          managedRoleIds.delete(roleId);
          targetRoleIds.delete(roleId);
          logger.warn({ ...logCtx, roleId }, 'Role is configured but does not exist in the Discord guild');
        }
      }

      // 6. Calculate adds and removes
      const currentRoles = member.roles.cache;
      const rolesToAdd = Array.from(targetRoleIds).filter(id => !currentRoles.has(id));
      const rolesToRemove = Array.from(managedRoleIds).filter(id => currentRoles.has(id) && !targetRoleIds.has(id));

      // Get bot user details and roles for diagnostics
      const me = guild.members.me || await guild.members.fetch({ user: guild.client.user.id, force: true }).catch(() => null);
      const botHighestRole = me?.roles.highest;
      const memberHighestRole = member.roles.highest;

      // 7. Apply role additions
      for (const roleId of rolesToAdd) {
        const targetRole = guild.roles.cache.get(roleId);
        const detailCtx = {
          ...logCtx,
          roleId,
          roleName: targetRole?.name || 'Unknown',
          rolePosition: targetRole?.position ?? -1,
          botHighestRoleName: botHighestRole?.name || 'Unknown',
          botHighestRolePosition: botHighestRole?.position ?? -1,
          memberHighestRoleName: memberHighestRole?.name || 'Unknown',
          memberHighestRolePosition: memberHighestRole?.position ?? -1,
        };

        if (!me) {
          logger.error(detailCtx, 'Failed to assign role: Bot member object not found in guild cache');
          continue;
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          logger.error(detailCtx, 'Failed to assign role: Bot lacks ManageRoles permission in this guild');
          continue;
        }

        if (targetRole && botHighestRole && targetRole.position >= botHighestRole.position) {
          logger.error(
            detailCtx,
            `Failed to assign role '${targetRole.name}': Role position is equal to or higher than the bot's highest role '${botHighestRole.name}' in the hierarchy`
          );
          continue;
        }

        if (botHighestRole && memberHighestRole && memberHighestRole.position >= botHighestRole.position) {
          logger.error(
            detailCtx,
            `Failed to assign role '${targetRole?.name || 'Unknown'}': Member highest role '${memberHighestRole.name}' is equal to or higher than the bot's highest role '${botHighestRole.name}' in the hierarchy`
          );
          continue;
        }

        try {
          await member.roles.add(roleId);
          logger.info({ ...logCtx, roleId, roleName: targetRole?.name || 'Unknown' }, 'Successfully assigned role to user');
        } catch (addErr) {
          logger.error(
            { ...detailCtx, error: (addErr as Error).message },
            'Failed to assign role (missing permissions or role hierarchy issues)'
          );
        }
      }

      // 8. Apply role removals
      for (const roleId of rolesToRemove) {
        const targetRole = guild.roles.cache.get(roleId);
        const detailCtx = {
          ...logCtx,
          roleId,
          roleName: targetRole?.name || 'Unknown',
          rolePosition: targetRole?.position ?? -1,
          botHighestRoleName: botHighestRole?.name || 'Unknown',
          botHighestRolePosition: botHighestRole?.position ?? -1,
          memberHighestRoleName: memberHighestRole?.name || 'Unknown',
          memberHighestRolePosition: memberHighestRole?.position ?? -1,
        };

        if (!me) {
          logger.error(detailCtx, 'Failed to remove role: Bot member object not found in guild cache');
          continue;
        }

        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          logger.error(detailCtx, 'Failed to remove role: Bot lacks ManageRoles permission in this guild');
          continue;
        }

        if (targetRole && botHighestRole && targetRole.position >= botHighestRole.position) {
          logger.error(
            detailCtx,
            `Failed to remove role '${targetRole.name}': Role position is equal to or higher than the bot's highest role '${botHighestRole.name}' in the hierarchy`
          );
          continue;
        }

        if (botHighestRole && memberHighestRole && memberHighestRole.position >= botHighestRole.position) {
          logger.error(
            detailCtx,
            `Failed to remove role '${targetRole?.name || 'Unknown'}': Member highest role '${memberHighestRole.name}' is equal to or higher than the bot's highest role '${botHighestRole.name}' in the hierarchy`
          );
          continue;
        }

        try {
          await member.roles.remove(roleId);
          logger.info({ ...logCtx, roleId, roleName: targetRole?.name || 'Unknown' }, 'Successfully removed role from user');
        } catch (removeErr) {
          logger.error(
            { ...detailCtx, error: (removeErr as Error).message },
            'Failed to remove role (missing permissions or role hierarchy issues)'
          );
        }
      }

      // 9. Update last sync time
      await prisma.userLink.update({
        where: { id: userLink.id },
        data: { updatedAt: new Date() },
      }).catch(() => null);

      logger.info(
        { ...logCtx, added: rolesToAdd.length, removed: rolesToRemove.length },
        `Role sync finished successfully for ${member.user.tag}`
      );
    } catch (error) {
      logger.error({ ...logCtx, error: (error as Error).message }, 'Failed role sync workflow for member');
      throw error;
    }
  }

  /**
   * Syncs roles for a single user across all mutual guilds
   */
  async syncUserAcrossGuilds(userLink: UserLink, guilds: Guild[]): Promise<void> {
    for (const guild of guilds) {
      try {
        const member = await guild.members.fetch({ user: userLink.discordId, force: true }).catch(() => null);
        if (member) {
          await this.syncMember(guild, member, userLink);
        }
      } catch (error) {
        logger.error(
          { guildId: guild.id, discordId: userLink.discordId, error: (error as Error).message },
          'Failed to sync user in guild'
        );
      }
    }
  }
}
