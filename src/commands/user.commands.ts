import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ComponentType,
  GuildMember,
} from 'discord.js';
import { VerificationService } from '../services/verification.service';
import { RoleSyncService } from '../services/roleSync.service';
import { WarEraService } from '../warera/service';
import { logger } from '../utils/logger';
import { prisma } from '../database';
import { UserGetUserLiteResponse } from '../types/Responses';

export class UserCommands {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly roleSyncService: RoleSyncService,
    private readonly wareraService: WarEraService
  ) {}

  /**
   * Handler for /verify
   */
  async verify(interaction: ChatInputCommandInteraction): Promise<void> {
    const username = interaction.options.getString('username', true);
    const discordId = interaction.user.id;

    logger.info({ discordId, username }, 'Received /verify command');

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.verificationService.startVerification(discordId, username);

      if (result.status === 'not_found') {
        await interaction.editReply({
          content: `❌ Could not find any WarEra player matching **${username}**. Please verify the spelling and try again.`,
        });
        return;
      }

      if (result.status === 'success') {
        const { profile, userLink } = result;
        await interaction.editReply({
          content: `🔄 Account linked successfully! Syncing your roles for **${profile.username}**...`,
        });

        // Run sync immediately
        const member = interaction.member as GuildMember;
        if (member && interaction.guild) {
          await this.roleSyncService.syncMember(interaction.guild, member, userLink);
          await interaction.followUp({
            content: `✅ Done! Verified and synced roles for **${profile.username}** (Level ${profile.leveling?.level || 0}).`,
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: `✅ Account linked successfully as **${profile.username}**, but role sync could not run because this command was not executed in a Discord server.`,
            ephemeral: true,
          });
        }
        return;
      }

      if (result.status === 'multiple') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('verify_select_profile')
          .setPlaceholder('Choose your WarEra profile')
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
          content: '⚠️ Multiple players matched your search. Please select your exact profile from the menu below:',
          components: [row],
        });

        // Collect selection
        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60000,
        });

        collector.on('collect', async (menuInteraction) => {
          if (menuInteraction.user.id !== interaction.user.id) {
            await menuInteraction.reply({
              content: 'This menu is only for the user who ran the verify command.',
              ephemeral: true,
            });
            return;
          }

          await menuInteraction.deferUpdate();
          const selectedUserId = menuInteraction.values[0];
          const selectedProfile = result.profiles.find((p) => p._id === selectedUserId);

          if (!selectedProfile) {
            await menuInteraction.followUp({ content: '❌ Selected profile not found. Please run `/verify` again.', ephemeral: true });
            return;
          }

          // Link selected profile
          const userLink = await this.verificationService.linkAccount(
            discordId,
            selectedProfile._id,
            selectedProfile.username
          );

          await menuInteraction.editReply({
            content: `🔄 Profile **${selectedProfile.username}** selected. Linking and syncing roles...`,
            components: [],
          });

          const member = interaction.member as GuildMember;
          if (member && interaction.guild) {
            try {
              await this.roleSyncService.syncMember(interaction.guild, member, userLink);
              await menuInteraction.followUp({
                content: `✅ Verified and synced roles for **${selectedProfile.username}** (Level ${selectedProfile.leveling?.level || 0}).`,
                ephemeral: true,
              });
            } catch (syncErr) {
              logger.error({ error: (syncErr as Error).message }, 'Failed to sync member roles after menu selection');
              await menuInteraction.followUp({
                content: `✅ Account linked as **${selectedProfile.username}**, but role sync encountered an issue. Admins can run \`/sync\` to refresh roles.`,
                ephemeral: true,
              });
            }
          } else {
            await menuInteraction.followUp({
              content: `✅ Account linked successfully as **${selectedProfile.username}**.`,
              ephemeral: true,
            });
          }
          collector.stop();
        });

        collector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            await interaction.editReply({
              content: '❌ Verification timed out. Please run the `/verify` command again.',
              components: [],
            }).catch(() => null);
          }
        });
      }
    } catch (error) {
      logger.error({ error: (error as Error).message, discordId, username }, 'Error executing verify command');
      await interaction.editReply({
        content: `❌ Verification failed due to an API or database error. Message: ${(error as Error).message}`,
      }).catch(() => null);
    }
  }

  /**
   * Helper to build the upgraded rich profile embed card
   */
  private async buildProfileEmbed(
    interaction: ChatInputCommandInteraction,
    profile: UserGetUserLiteResponse
  ): Promise<EmbedBuilder> {
    // Fetch MU details
    let muName: string = 'None';
    if (profile.mu) {
      try {
        const mu = await this.wareraService.getMu(profile.mu);
        muName = mu.name;
      } catch (err) {
        logger.warn({ error: (err as Error).message, muId: profile.mu }, 'Failed to fetch MU details for profile embed');
        muName = `ID: ${profile.mu}`;
      }
    }

    // Compute Specialization
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

    let specializationText = '⚖️ Hybrid Specialist';
    let specializationSubText = '';

    if (warScore >= economyScore * 1.5) {
      specializationText = '🪖 War Specialist';
      specializationSubText = '\n*أبو عامر راضي عنك*';
    } else if (economyScore >= warScore * 1.5) {
      specializationText = '🌾 Economy Specialist';
      specializationSubText = '\n*الاخ بيلعب المزرعة السعيدة*';
    }

    // Prepare variables
    const level = profile.leveling?.level !== undefined ? profile.leveling.level : '?';
    const totalDamage = profile.stats?.damagesCount !== undefined ? profile.stats.damagesCount.toLocaleString() : '0';
    const totalDamageRank = profile.rankings?.userDamages?.rank !== undefined ? `#${profile.rankings.userDamages.rank}` : 'Unranked';
    const weeklyDamage = profile.rankings?.weeklyUserDamages?.value !== undefined ? profile.rankings.weeklyUserDamages.value.toLocaleString() : '0';
    const weeklyDamageRank = profile.rankings?.weeklyUserDamages?.rank !== undefined ? `#${profile.rankings.weeklyUserDamages.rank}` : 'Unranked';

    let description = `**👤 ${profile.username}**\n\n`;
    description += `**⭐ Level:** ${level}\n\n`;
    description += `**${specializationText}**${specializationSubText}\n\n`;
    description += `**⚔ Total Damage:** ${totalDamage}\n`;
    description += `**🇪🇬 Egypt Total Damage Rank:** ${totalDamageRank}\n\n`;
    description += `**🔥 Weekly Damage:** ${weeklyDamage}\n`;
    description += `**🇪🇬 Egypt Weekly Damage Rank:** ${weeklyDamageRank}\n\n`;
    description += `**⭐ Military Unit:** ${muName}`;

    // Special top ranking messages
    const totalRankNum = profile.rankings?.userDamages?.rank;
    const weeklyRankNum = profile.rankings?.weeklyUserDamages?.rank;

    const isRank1 = totalRankNum === 1 || weeklyRankNum === 1;
    const isTop10 = (totalRankNum !== undefined && totalRankNum >= 2 && totalRankNum <= 10) || 
                    (weeklyRankNum !== undefined && weeklyRankNum >= 2 && weeklyRankNum <= 10);

    if (isRank1) {
      description += `\n\n**👑 الباشا الكبير**`;
    } else if (isTop10) {
      description += `\n\n**💥 اخويا المدرعة الي الضربة منه باربعة**`;
    }

    const embed = new EmbedBuilder()
      .setColor('#2b2d31') // Modern dark invisible color for premium feel
      .setThumbnail(profile.avatarUrl || 'https://raw.githubusercontent.com/discord/discord-logo-template/master/discord-logo-blue.png')
      .setDescription(description);

    return embed;
  }

  /**
   * Handler for /profile
   */
  async profile(interaction: ChatInputCommandInteraction): Promise<void> {
    const memberOption = interaction.options.getUser('member', false);
    const usernameOption = interaction.options.getString('username', false);

    await interaction.deferReply();

    try {
      // 1. Search by Username Option
      if (usernameOption) {
        const profiles = await this.wareraService.searchPlayers(usernameOption);

        if (profiles.length === 0) {
          await interaction.editReply({
            content: `❌ Could not find any WarEra player matching **${usernameOption}**.`,
          });
          return;
        }

        if (profiles.length === 1) {
          const profile = profiles[0];
          const embed = await this.buildProfileEmbed(interaction, profile);
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // Multiple profiles found
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('profile_select_member')
          .setPlaceholder('Choose the correct profile')
          .addOptions(
            profiles.slice(0, 25).map((p) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(`${p.username} (Level ${p.leveling?.level || 0})`)
                .setValue(p._id)
                .setDescription(`Country ID: ${p.country || 'None'}`)
            )
          );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const reply = await interaction.editReply({
          content: '⚠️ Multiple players matched your search. Please select the correct profile:',
          components: [row],
        });

        const collector = reply.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60000,
        });

        collector.on('collect', async (menuInteraction) => {
          if (menuInteraction.user.id !== interaction.user.id) {
            await menuInteraction.reply({
              content: 'Only the user who ran this command can select a profile.',
              ephemeral: true,
            });
            return;
          }

          await menuInteraction.deferUpdate();
          const selectedUserId = menuInteraction.values[0];
          const selectedProfile = profiles.find((p) => p._id === selectedUserId);

          if (!selectedProfile) {
            await menuInteraction.followUp({ content: '❌ Selected profile not found.', ephemeral: true });
            return;
          }

          const embed = await this.buildProfileEmbed(interaction, selectedProfile);
          await menuInteraction.editReply({
            content: null,
            embeds: [embed],
            components: [],
          });
          collector.stop();
        });

        collector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            await interaction.editReply({
              content: '❌ Profile selection timed out.',
              components: [],
            }).catch(() => null);
          }
        });

        return;
      }

      // 2. Resolve target Discord ID
      const targetDiscordId = memberOption ? memberOption.id : interaction.user.id;

      const userLink = await this.verificationService.getLinkByDiscordId(targetDiscordId);
      if (!userLink) {
        if (memberOption) {
          await interaction.editReply({
            content: `❌ <@${targetDiscordId}> is not linked to any WarEra profile.`,
          });
        } else {
          await interaction.editReply({
            content: '❌ Your Discord account is not linked to a WarEra profile. Use `/verify <username>` to verify first.',
          });
        }
        return;
      }

      // Fetch profile
      const profile = await this.wareraService.getUserProfile(userLink.wareraUserId);
      const embed = await this.buildProfileEmbed(interaction, profile);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error({ error: (error as Error).message, usernameOption, memberId: memberOption?.id }, 'Error in profile command');
      await interaction.editReply({
        content: `❌ Failed to retrieve profile: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Handler for /sync-me
   */
  async syncMe(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id;
    const member = interaction.member as GuildMember;

    if (!interaction.guild || !member) {
      await interaction.reply({
        content: '❌ This command can only be run within a Discord server.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const userLink = await this.verificationService.getLinkByDiscordId(discordId);
      if (!userLink) {
        await interaction.editReply({
          content: '❌ Your Discord account is not linked. Use `/verify <username>` to verify first.',
        });
        return;
      }

      await this.roleSyncService.syncMember(interaction.guild, member, userLink);
      await interaction.editReply({
        content: `✅ Your roles have been synchronized based on your latest WarEra stats!`,
      });
    } catch (error) {
      logger.error({ error: (error as Error).message, discordId }, 'Error running /sync-me');
      await interaction.editReply({
        content: `❌ Sync failed: ${(error as Error).message}`,
      });
    }
  }
}
