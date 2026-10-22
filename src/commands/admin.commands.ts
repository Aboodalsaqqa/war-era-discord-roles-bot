import {
  ChatInputCommandInteraction,
  GuildMember,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import { VerificationService } from '../services/verification.service';
import { RoleSyncService, EDUCATION_LVL_1_ROLE_ID, EDUCATION_LVL_2_ROLE_ID, ALL_REGIMENT_ROLE_IDS } from '../services/roleSync.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { MuRoleRepository } from '../repositories/muRole.repository';
import { LevelRoleRepository } from '../repositories/levelRole.repository';
import { UserLinkRepository } from '../repositories/userLink.repository';
import { logger } from '../utils/logger';
import { CommandTracer, safeDeferReply, safeEditReply } from '../utils/commandTracer';

export const FORCE_VERIFY_MODERATOR_ROLE_ID = '1500579625405780129';
export const FORCE_VERIFY_EDUCATION_STAFF_ROLE_ID = '1477944138887331882';
export const FORCE_VERIFY_AUTHORIZED_ROLE_ID = '1496865174920101970';

export class AdminCommands {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly roleSyncService: RoleSyncService,
    private readonly userLinkRepo: UserLinkRepository,
    private readonly guildConfigRepo: GuildConfigRepository,
    private readonly muRoleRepo: MuRoleRepository,
    private readonly levelRoleRepo: LevelRoleRepository
  ) {}

  /**
   * Checks if user is authorized to run forceverify (Admin, Moderator, Education Staff, or Authorized Role)
   */
  private async isForceVerifyAuthorized(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const guild = interaction.guild;
    if (!guild) return false;

    // Check interaction-level administrator permissions if present
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    const member = interaction.member || (await guild.members.fetch(interaction.user.id).catch(() => null));

    if (!member) return false;

    // 1. Administrator permission check on member
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      (member.permissions && typeof (member.permissions as any).has === 'function'
        ? (member.permissions as any).has(PermissionFlagsBits.Administrator)
        : false);
    if (isAdmin) {
      return true;
    }

    // Helper to verify role presence across GuildMember cache, raw array, or interaction payload
    const hasRole = (roleId: string): boolean => {
      if (!roleId) return false;
      const mem = member as any;
      if (mem?.roles) {
        if (typeof mem.roles.cache?.has === 'function' && mem.roles.cache.has(roleId)) {
          return true;
        }
        if (Array.isArray(mem.roles) && mem.roles.includes(roleId)) {
          return true;
        }
      }
      if (Array.isArray(mem?._roles) && mem._roles.includes(roleId)) {
        return true;
      }
      const raw = interaction.member as any;
      if (raw?.roles) {
        if (typeof raw.roles.cache?.has === 'function' && raw.roles.cache.has(roleId)) {
          return true;
        }
        if (Array.isArray(raw.roles) && raw.roles.includes(roleId)) {
          return true;
        }
      }
      if (Array.isArray(raw?._roles) && raw._roles.includes(roleId)) {
        return true;
      }
      return false;
    };

    // 2. Specific authorized role ID (1496865174920101970)
    if (hasRole(FORCE_VERIFY_AUTHORIZED_ROLE_ID)) {
      return true;
    }

    // 3. Moderator role
    if (hasRole(FORCE_VERIFY_MODERATOR_ROLE_ID)) {
      return true;
    }

    // 4. Education Staff role
    if (hasRole(FORCE_VERIFY_EDUCATION_STAFF_ROLE_ID)) {
      return true;
    }

    // 5. Configured Officer or Trusted role (from guildConfig)
    try {
      const config = await this.guildConfigRepo.getByGuildId(guild.id);
      if (config?.officerRoleId && hasRole(config.officerRoleId)) {
        return true;
      }
      if (config?.trustedRoleId && hasRole(config.trustedRoleId)) {
        return true;
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message, guildId: guild.id }, 'Failed to check guildConfig for officer role');
    }

    return false;
  }

  /**
   * Handler for /forceverify <user> <username>
   */
  async forceVerify(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('forceverify', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const targetUser = interaction.options.getUser('user', true);
    const username = interaction.options.getString('username', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    const isAuthorized = await this.isForceVerifyAuthorized(interaction);
    if (!isAuthorized) {
      await interaction.reply({
        content: '❌ You do not have permission to use `/forceverify`. Only Administrators, Moderators, Education Staff, or authorized roles may use this command.',
        ephemeral: true,
      });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, invokerId: interaction.user.id, targetId: targetUser.id, username }, '/forceverify triggered');
    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { targetId: targetUser.id, targetUsername: username });
      const result = await this.verificationService.startVerification(targetUser.id, username);

      if (result.status === 'not_found') {
        tracer.checkpoint(9, 'work_complete', { status: 'not_found' });
        await safeEditReply(interaction, tracer, {
          content: `❌ Could not find any WarEra player matching **${username}** for force-verification.`,
        });
        return;
      }

      if (result.status === 'success') {
        const { profile, userLink } = result;
        await safeEditReply(interaction, tracer, {
          content: `🔄 Link created for <@${targetUser.id}> as **${profile.username}**. Running role sync...`,
        });

        const member = await guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
        if (member) {
          await this.roleSyncService.syncMember(guild, member, userLink);
          tracer.checkpoint(9, 'work_complete', { status: 'success' });
          await interaction.followUp({
            content: `✅ Successfully force-verified and synced roles for <@${targetUser.id}> as **${profile.username}** (Level ${profile.leveling?.level || 0}).`,
            ephemeral: true,
          }).catch((err) => {
            logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Failed to send followUp in forceverify');
          });
        } else {
          tracer.checkpoint(9, 'work_complete', { status: 'success_not_in_server' });
          await interaction.followUp({
            content: `✅ Link created for <@${targetUser.id}> as **${profile.username}**, but role sync could not run because they are not a member of this server.`,
            ephemeral: true,
          }).catch((err) => {
            logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Failed to send followUp in forceverify');
          });
        }
        return;
      }

      if (result.status === 'multiple') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('force_verify_select_profile')
          .setPlaceholder('Choose the correct profile')
          .addOptions(
            result.profiles.map((p) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`${p.username} (Level ${p.leveling?.level || 0})`)
                .setValue(p._id)
                .setDescription(`Country ID: ${p.country || 'None'}`)
            )
          );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const reply = await interaction.editReply({
          content: `⚠️ Multiple profiles matched **${username}**. Please select the one to map to <@${targetUser.id}>:`,
          components: [row],
        });

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60000,
        });

        collector.on('collect', async (menuInteraction) => {
          if (menuInteraction.user.id !== interaction.user.id) {
            await menuInteraction.reply({ content: 'Only the administrator running this command can select a profile.', ephemeral: true });
            return;
          }

          await menuInteraction.deferUpdate();
          const selectedUserId = menuInteraction.values[0];
          const selectedProfile = result.profiles.find((p) => p._id === selectedUserId);

          if (!selectedProfile) {
            await menuInteraction.followUp({ content: '❌ Selected profile not found.', ephemeral: true });
            return;
          }

          const userLink = await this.verificationService.linkAccount(
            targetUser.id,
            selectedProfile._id,
            selectedProfile.username
          );

          await menuInteraction.editReply({
            content: `🔄 Linking <@${targetUser.id}> to **${selectedProfile.username}** and syncing roles...`,
            components: [],
          });

          const member = await guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
          if (member) {
            try {
              await this.roleSyncService.syncMember(guild, member, userLink);
              await menuInteraction.followUp({
                content: `✅ Force-verified and synced roles for <@${targetUser.id}> as **${selectedProfile.username}** (Level ${selectedProfile.leveling?.level || 0}).`,
                ephemeral: true,
              });
            } catch (err) {
              logger.error({ error: (err as Error).message }, 'Failed force-verify role sync');
              await menuInteraction.followUp({ content: `✅ Link created as **${selectedProfile.username}**, but role sync failed.`, ephemeral: true });
            }
          } else {
            await menuInteraction.followUp({ content: `✅ Link created as **${selectedProfile.username}**.`, ephemeral: true });
          }
          collector.stop();
        });
      }
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, targetUserId: targetUser.id }, 'Error forceVerify');
      await safeEditReply(interaction, tracer, { content: `❌ Force verify failed: ${(error as Error).message}` });
    }
  }

  /**
   * Handler for /unverify <user>
   */
  async unVerify(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('unverify', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, adminId: interaction.user.id, targetId: targetUser.id }, 'Admin /unverify triggered');
    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { targetId: targetUser.id });
      const userLink = await this.verificationService.getLinkByDiscordId(targetUser.id);
      if (!userLink) {
        tracer.checkpoint(9, 'work_complete', { status: 'not_linked' });
        await safeEditReply(interaction, tracer, { content: `❌ <@${targetUser.id}> is not linked to any WarEra profile.` });
        return;
      }

      // 1. Unlink account in DB
      await this.verificationService.unlinkAccount(targetUser.id);

      // 2. Remove all bot managed roles from user in this guild
      const member = await guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
      if (member) {
        const config = await this.guildConfigRepo.getByGuildId(guild.id);
        const muRoles = await this.muRoleRepo.listByGuild(guild.id);
        const levelRoles = await this.levelRoleRepo.listByGuild(guild.id);

        const managedRoleIds = new Set<string>();

        // Gather all role IDs managed by the bot
        if (config) {
          [
            config.presidentRoleId,
            config.vicePresidentRoleId,
            config.congressRoleId,
            config.warRoleId,
            config.economyRoleId,
            config.hybridRoleId,
            config.muCommanderRoleId,
            config.muOwnerRoleId,
            config.noMuRoleId,
          ].forEach((id) => { if (id) managedRoleIds.add(id); });
        }
        muRoles.forEach((r) => managedRoleIds.add(r.discordRoleId));
        levelRoles.forEach((r) => managedRoleIds.add(r.discordRoleId));
        managedRoleIds.add(EDUCATION_LVL_1_ROLE_ID);
        managedRoleIds.add(EDUCATION_LVL_2_ROLE_ID);
        ALL_REGIMENT_ROLE_IDS.forEach((id) => managedRoleIds.add(id));

        const rolesToRemove = Array.from(managedRoleIds).filter((id) => member.roles.cache.has(id));

        for (const roleId of rolesToRemove) {
          if (guild.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch((err) =>
              logger.warn({ correlationId: tracer.correlationId, roleId, targetId: targetUser.id, error: err.message }, 'Failed to remove role on unverify')
            );
          }
        }

        tracer.checkpoint(9, 'work_complete', { status: 'unverified_roles_removed', count: rolesToRemove.length });
        await safeEditReply(interaction, tracer, {
          content: `✅ Unverified <@${targetUser.id}> (removed link and stripped ${rolesToRemove.length} bot-managed roles).`,
        });
      } else {
        tracer.checkpoint(9, 'work_complete', { status: 'unverified_no_member' });
        await safeEditReply(interaction, tracer, {
          content: `✅ Unverified <@${targetUser.id}> (removed database link, but could not strip roles as they are not currently in this server).`,
        });
      }
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, targetUserId: targetUser.id }, 'Error unVerify');
      await safeEditReply(interaction, tracer, { content: `❌ Unverify failed: ${(error as Error).message}` });
    }
  }

  /**
   * Handler for /sync <user>
   */
  async sync(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('sync', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, adminId: interaction.user.id, targetId: targetUser.id }, 'Admin /sync triggered');
    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { targetId: targetUser.id });
      const userLink = await this.verificationService.getLinkByDiscordId(targetUser.id);
      if (!userLink) {
        tracer.checkpoint(9, 'work_complete', { status: 'not_linked' });
        await safeEditReply(interaction, tracer, { content: `❌ <@${targetUser.id}> is not verified/linked.` });
        return;
      }

      const member = await guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
      if (!member) {
        tracer.checkpoint(9, 'work_complete', { status: 'not_guild_member' });
        await safeEditReply(interaction, tracer, { content: `❌ User is not a member of this server.` });
        return;
      }

      await this.roleSyncService.syncMember(guild, member, userLink);
      tracer.checkpoint(9, 'work_complete', { status: 'success' });
      await safeEditReply(interaction, tracer, { content: `✅ Roles successfully synchronized for <@${targetUser.id}>.` });
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, targetUserId: targetUser.id }, 'Error sync command');
      await safeEditReply(interaction, tracer, { content: `❌ Sync failed: ${(error as Error).message}` });
    }
  }

  /**
   * Handler for /syncall
   */
  async syncAll(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('sync-all', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, adminId: interaction.user.id }, 'Admin /syncall triggered');
    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: false });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start');
      const allLinks = await this.userLinkRepo.listAll();
      if (allLinks.length === 0) {
        tracer.checkpoint(9, 'work_complete', { status: 'empty' });
        await safeEditReply(interaction, tracer, { content: '⚠️ There are no verified users in the database to sync.' });
        return;
      }

      await safeEditReply(interaction, tracer, { content: `🔄 Beginning synchronization for ${allLinks.length} linked players. Please wait...` });

      let successCount = 0;
      let failCount = 0;

      for (const link of allLinks) {
        try {
          const member = await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null);
          if (member) {
            await this.roleSyncService.syncMember(guild, member, link);
            successCount++;
          } else {
            logger.debug({ guildId: guild.id, discordId: link.discordId }, 'Skipping syncall user: member not in guild');
          }
        } catch (err) {
          logger.error({ correlationId: tracer.correlationId, discordId: link.discordId, error: (err as Error).message }, 'Failed to sync user in syncall');
          failCount++;
        }
      }

      tracer.checkpoint(9, 'work_complete', { successCount, failCount });
      await safeEditReply(interaction, tracer, {
        content: `✅ Synchronization complete!\n📊 **Results:**\n- Synced: \`${successCount}\` user(s)\n- Failed: \`${failCount}\` user(s)`,
      });
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message }, 'Error in syncAll');
      await safeEditReply(interaction, tracer, { content: `❌ Syncall failed: ${(error as Error).message}` });
    }
  }
}
