import {
  ChatInputCommandInteraction,
  GuildMember,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
} from 'discord.js';
import { VerificationService } from '../services/verification.service';
import { RoleSyncService } from '../services/roleSync.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { MuRoleRepository } from '../repositories/muRole.repository';
import { LevelRoleRepository } from '../repositories/levelRole.repository';
import { UserLinkRepository } from '../repositories/userLink.repository';
import { logger } from '../utils/logger';

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
   * Handler for /forceverify <user> <username>
   */
  async forceVerify(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const username = interaction.options.getString('username', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ adminId: interaction.user.id, targetId: targetUser.id, username }, 'Admin /forceverify triggered');
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.verificationService.startVerification(targetUser.id, username);

      if (result.status === 'not_found') {
        await interaction.editReply({
          content: `❌ Could not find any WarEra player matching **${username}** for force-verification.`,
        });
        return;
      }

      if (result.status === 'success') {
        const { profile, userLink } = result;
        await interaction.editReply({
          content: `🔄 Link created for <@${targetUser.id}> as **${profile.username}**. Running role sync...`,
        });

        const member = await guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
        if (member) {
          await this.roleSyncService.syncMember(guild, member, userLink);
          await interaction.followUp({
            content: `✅ Successfully force-verified and synced roles for <@${targetUser.id}> as **${profile.username}** (Level ${profile.leveling?.level || 0}).`,
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: `✅ Link created for <@${targetUser.id}> as **${profile.username}**, but role sync could not run because they are not a member of this server.`,
            ephemeral: true,
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
      logger.error({ error: (error as Error).message, targetUserId: targetUser.id }, 'Error forceVerify');
      await interaction.editReply({ content: `❌ Force verify failed: ${(error as Error).message}` }).catch(() => null);
    }
  }

  /**
   * Handler for /unverify <user>
   */
  async unVerify(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ adminId: interaction.user.id, targetId: targetUser.id }, 'Admin /unverify triggered');
    await interaction.deferReply({ ephemeral: true });

    try {
      const userLink = await this.verificationService.getLinkByDiscordId(targetUser.id);
      if (!userLink) {
        await interaction.editReply({ content: `❌ <@${targetUser.id}> is not linked to any WarEra profile.` });
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

        const rolesToRemove = Array.from(managedRoleIds).filter((id) => member.roles.cache.has(id));

        for (const roleId of rolesToRemove) {
          if (guild.roles.cache.has(roleId)) {
            await member.roles.remove(roleId).catch((err) =>
              logger.warn({ roleId, targetId: targetUser.id, error: err.message }, 'Failed to remove role on unverify')
            );
          }
        }

        await interaction.editReply({
          content: `✅ Unverified <@${targetUser.id}> (removed link and stripped ${rolesToRemove.length} bot-managed roles).`,
        });
      } else {
        await interaction.editReply({
          content: `✅ Unverified <@${targetUser.id}> (removed database link, but could not strip roles as they are not currently in this server).`,
        });
      }
    } catch (error) {
      logger.error({ error: (error as Error).message, targetUserId: targetUser.id }, 'Error unVerify');
      await interaction.editReply({ content: `❌ Unverify failed: ${(error as Error).message}` });
    }
  }

  /**
   * Handler for /sync <user>
   */
  async sync(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user', true);
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ adminId: interaction.user.id, targetId: targetUser.id }, 'Admin /sync triggered');
    await interaction.deferReply({ ephemeral: true });

    try {
      const userLink = await this.verificationService.getLinkByDiscordId(targetUser.id);
      if (!userLink) {
        await interaction.editReply({ content: `❌ <@${targetUser.id}> is not verified/linked.` });
        return;
      }

      const member = await guild.members.fetch({ user: targetUser.id, force: true }).catch(() => null);
      if (!member) {
        await interaction.editReply({ content: `❌ User is not a member of this server.` });
        return;
      }

      await this.roleSyncService.syncMember(guild, member, userLink);
      await interaction.editReply({ content: `✅ Roles successfully synchronized for <@${targetUser.id}>.` });
    } catch (error) {
      logger.error({ error: (error as Error).message, targetUserId: targetUser.id }, 'Error sync command');
      await interaction.editReply({ content: `❌ Sync failed: ${(error as Error).message}` });
    }
  }

  /**
   * Handler for /syncall
   */
  async syncAll(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ adminId: interaction.user.id }, 'Admin /syncall triggered');
    await interaction.deferReply();

    try {
      const allLinks = await this.userLinkRepo.listAll();
      if (allLinks.length === 0) {
        await interaction.editReply({ content: '⚠️ There are no verified users in the database to sync.' });
        return;
      }

      await interaction.editReply({ content: `🔄 Beginning synchronization for ${allLinks.length} linked players. Please wait...` });

      let successCount = 0;
      let failCount = 0;

      for (const link of allLinks) {
        try {
          const member = await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null);
          if (member) {
            await this.roleSyncService.syncMember(guild, member, link);
            successCount++;
          } else {
            // Member is not in this guild, skip without listing as "fail" (or increment skipped count)
            logger.debug({ guildId: guild.id, discordId: link.discordId }, 'Skipping syncall user: member not in guild');
          }
        } catch (err) {
          logger.error({ discordId: link.discordId, error: (err as Error).message }, 'Failed to sync user in syncall');
          failCount++;
        }
      }

      await interaction.editReply({
        content: `✅ Synchronization complete!\n📊 **Results:**\n- Synced: \`${successCount}\` user(s)\n- Failed: \`${failCount}\` user(s)`,
      });
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error in syncAll');
      await interaction.editReply({ content: `❌ Syncall failed: ${(error as Error).message}` });
    }
  }
}
