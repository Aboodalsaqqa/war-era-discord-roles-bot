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
    const guild = interaction.guild;
    
    // Check if player is linked in DB
    const userLink = await this.verificationService.getLinkByWarEraUserId(profile._id);

    // Fetch country name
    let countryName: string | undefined = undefined;
    try {
      const countries = await this.wareraService.getAllCountries();
      const country = countries.find((c) => c._id === profile.country);
      if (country) {
        countryName = country.name;
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Failed to fetch country name for profile embed');
    }

    // Fetch MU details
    let muName: string | undefined = undefined;
    let muPosition: string | undefined = undefined;

    if (profile.mu) {
      try {
        const mu = await this.wareraService.getMu(profile.mu);
        muName = mu.name;
        if (profile._id === mu.user) {
          muPosition = 'Founder / Owner 👑';
        } else if (mu.roles?.commanders?.includes(profile._id)) {
          muPosition = 'Commander 🎖️';
        } else {
          muPosition = 'Member';
        }
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

    let specialization = '⚖️ Hybrid';
    if (warScore >= economyScore * 1.5) {
      specialization = '⚔️ War Specialist';
    } else if (economyScore >= warScore * 1.5) {
      specialization = '🏭 Economy Specialist';
    }

    // 1. Identity Fields (Hide fields with no value)
    const identityFields: string[] = [];
    identityFields.push(`• **Username:** \`${profile.username}\``);
    if (profile.leveling?.level !== undefined) {
      identityFields.push(`• **Level:** \`${profile.leveling.level}\``);
    }
    if (countryName) {
      identityFields.push(`• **Country:** \`${countryName}\``);
    }
    if (muName) {
      identityFields.push(`• **Military Unit (MU):** \`${muName}\``);
    }
    if (muPosition) {
      identityFields.push(`• **MU Position:** \`${muPosition}\``);
    }
    identityFields.push(`• **Specialization:** \`${specialization}\``);
    
    if (profile.stats?.damagesCount !== undefined) {
      identityFields.push(`• **Total Damage:** \`${profile.stats.damagesCount.toLocaleString()}\``);
    }
    if (profile.rankings?.weeklyUserDamages?.value !== undefined) {
      identityFields.push(`• **Weekly Damage:** \`${profile.rankings.weeklyUserDamages.value.toLocaleString()}\``);
    }

    const embed = new EmbedBuilder()
      .setTitle(`WarEra Player Card | ${profile.username}`)
      .setColor('#D00000')
      .setThumbnail(profile.avatarUrl || 'https://raw.githubusercontent.com/discord/discord-logo-template/master/discord-logo-blue.png')
      .addFields({ name: '👤 Identity', value: identityFields.join('\n'), inline: false });

    // 2. Rankings Section (Hide if no rankings exist)
    const rankingFields: string[] = [];
    if (profile.rankings?.userLevel?.rank !== undefined) {
      rankingFields.push(`• **Global Level Rank:** \`#${profile.rankings.userLevel.rank}\` (${profile.rankings.userLevel.tier.toUpperCase()})`);
    }
    if (profile.rankings?.userDamages?.rank !== undefined) {
      rankingFields.push(`• **Total Damage Rank:** \`#${profile.rankings.userDamages.rank}\` (${profile.rankings.userDamages.tier.toUpperCase()})`);
    }
    if (profile.rankings?.weeklyUserDamages?.rank !== undefined) {
      rankingFields.push(`• **Weekly Damage Rank:** \`#${profile.rankings.weeklyUserDamages.rank}\` (${profile.rankings.weeklyUserDamages.tier.toUpperCase()})`);
    }
    if (profile.rankings?.userWealth?.rank !== undefined) {
      rankingFields.push(`• **Wealth Rank:** \`#${profile.rankings.userWealth.rank}\` (${profile.rankings.userWealth.tier.toUpperCase()})`);
    }
    if (profile.militaryRank !== undefined) {
      rankingFields.push(`• **Military Rank Level:** \`Level ${profile.militaryRank}\``);
    }

    if (rankingFields.length > 0) {
      embed.addFields({ name: '🏆 Rankings', value: rankingFields.join('\n'), inline: false });
    }

    // 3. Discord Integration & Military Readiness (only if linked)
    if (userLink && guild) {
      const member = await guild.members.fetch({ user: userLink.discordId, force: true }).catch(() => null);
      
      let eligibilityRecruitment = 'No';
      let inclusionOperations = 'No';
      const botManagedRolesList: string[] = [];
      const leadershipRolesList: string[] = [];

      if (member) {
        // Fetch Guild Config
        const guildConfig = await prisma.guildConfig.findUnique({
          where: { guildId: guild.id },
        });

        const hasCitizen = guildConfig && guildConfig.citizenRoleId
          ? member.roles.cache.has(guildConfig.citizenRoleId)
          : true;
        const hasTrusted = guildConfig && guildConfig.trustedRoleId
          ? member.roles.cache.has(guildConfig.trustedRoleId)
          : true;
        const isTrusted = hasCitizen && hasTrusted;

        inclusionOperations = isTrusted ? 'Yes ✅' : 'No ❌';
        eligibilityRecruitment = (isTrusted && !userLink.exemptFromRecruitment) ? 'Yes ✅' : 'No ❌';

        if (guildConfig) {
          // Check for Discord leadership roles
          if (guildConfig.muOwnerRoleId && member.roles.cache.has(guildConfig.muOwnerRoleId)) {
            leadershipRolesList.push(`<@&${guildConfig.muOwnerRoleId}>`);
          }
          if (guildConfig.muCommanderRoleId && member.roles.cache.has(guildConfig.muCommanderRoleId)) {
            leadershipRolesList.push(`<@&${guildConfig.muCommanderRoleId}>`);
          }

          // Check standard managed roles
          [
            guildConfig.presidentRoleId,
            guildConfig.vicePresidentRoleId,
            guildConfig.congressRoleId,
            guildConfig.warRoleId,
            guildConfig.economyRoleId,
            guildConfig.hybridRoleId,
            guildConfig.muCommanderRoleId,
            guildConfig.muOwnerRoleId,
            guildConfig.noMuRoleId,
          ].forEach((id) => {
            if (id && member.roles.cache.has(id)) {
              botManagedRolesList.push(`<@&${id}>`);
            }
          });

          // Mu Roles
          const muRoles = await prisma.muRole.findMany({ where: { guildId: guild.id } });
          muRoles.forEach((r) => {
            if (member.roles.cache.has(r.discordRoleId)) {
              botManagedRolesList.push(`<@&${r.discordRoleId}>`);
            }
          });

          // Level Roles
          const levelRoles = await prisma.levelRole.findMany({ where: { guildId: guild.id } });
          levelRoles.forEach((r) => {
            if (member.roles.cache.has(r.discordRoleId)) {
              botManagedRolesList.push(`<@&${r.discordRoleId}>`);
            }
          });
        }
      }

      // Add Military Readiness section
      embed.addFields({
        name: '🛡️ Military Readiness',
        value: `• **Eligible for Recruitment:** ${eligibilityRecruitment}\n• **Included in Operations:** ${inclusionOperations}`,
        inline: false,
      });

      // Add Discord Integration section
      const discordFields: string[] = [
        `• **Discord Member:** <@${userLink.discordId}>`,
        `• **Linked Since:** <t:${Math.floor(userLink.verifiedAt.getTime() / 1000)}:F>`,
        `• **Last Sync Time:** <t:${Math.floor(userLink.updatedAt.getTime() / 1000)}:R>`,
      ];

      // Remove duplicates from botManagedRolesList
      const uniqueManagedRoles = Array.from(new Set(botManagedRolesList));
      const rolesVal = uniqueManagedRoles.length > 0 ? uniqueManagedRoles.join(', ') : 'None';
      discordFields.push(`• **Managed Roles:** ${rolesVal}`);

      embed.addFields({
        name: '🤖 Discord Integration',
        value: discordFields.join('\n'),
        inline: false,
      });

      // Add MU Leadership roles explicitly if applicable
      if (leadershipRolesList.length > 0) {
        embed.addFields({
          name: '🎖️ MU Leadership Discord Roles',
          value: leadershipRolesList.join(', '),
          inline: false,
        });
      }
    } else if (userLink) {
      // Linked but not in this guild
      embed.addFields({
        name: '🤖 Discord Integration',
        value: `• **Discord User ID:** \`${userLink.discordId}\`\n• **Linked Since:** <t:${Math.floor(userLink.verifiedAt.getTime() / 1000)}:F>\n• **Status:** *Not a member of this server*`,
        inline: false,
      });
    } else {
      embed.setFooter({ text: 'Egypt WarEra Integration | Player is not linked to Discord' });
    }

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
