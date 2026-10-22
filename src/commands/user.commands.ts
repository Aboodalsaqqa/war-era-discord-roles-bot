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
import { ProfileTracer } from '../utils/profileTracer';
import { CommandTracer, safeDeferReply, safeEditReply } from '../utils/commandTracer';

export class UserCommands {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly roleSyncService: RoleSyncService,
    private readonly wareraService: WarEraService
  ) {}

  /**
   * Handler for /verify
   */
  async verify(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('verify', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const username = interaction.options.getString('username', true);
    const discordId = interaction.user.id;

    logger.info({ correlationId: tracer.correlationId, discordId, username }, 'Received /verify command');

    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { username, discordId });
      const result = await this.verificationService.startVerification(discordId, username);
      tracer.checkpoint(9, 'work_complete', { status: result.status });

      if (result.status === 'not_found') {
        await safeEditReply(interaction, tracer, {
          content: `❌ Could not find any WarEra player matching **${username}**. Please verify the spelling and try again.`,
        });
        return;
      }

      if (result.status === 'success') {
        const { profile, userLink } = result;
        await safeEditReply(interaction, tracer, {
          content: `🔄 Account linked successfully! Syncing your roles for **${profile.username}**...`,
        });

        // Run sync immediately
        const member = interaction.member as GuildMember;
        if (member && interaction.guild) {
          try {
            await this.roleSyncService.syncMember(interaction.guild, member, userLink);
            await interaction.followUp({
              content: `✅ Done! Verified and synced roles for **${profile.username}** (Level ${profile.leveling?.level || 0}).`,
              ephemeral: true,
            });
          } catch (syncErr) {
            logger.error({ correlationId: tracer.correlationId, error: (syncErr as Error).message }, 'Failed to sync member roles after verification');
            await interaction.followUp({
              content: `✅ Account linked as **${profile.username}**, but role sync encountered an issue. Admins can run \`/sync\` to refresh roles.`,
              ephemeral: true,
            });
          }
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

        await safeEditReply(interaction, tracer, {
          content: '⚠️ Multiple players matched your search. Please select your exact profile from the menu below:',
          components: [row],
        });

        // Collect selection
        const reply = await interaction.fetchReply().catch(() => null);
        if (!reply) return;

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

          await safeEditReply(interaction, tracer, {
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
              logger.error({ correlationId: tracer.correlationId, error: (syncErr as Error).message }, 'Failed to sync member roles after menu selection');
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
          if (reason === 'time' && collected.size === 0) {
            await safeEditReply(interaction, tracer, {
              content: '❌ Verification timed out. Please run the `/verify` command again.',
              components: [],
            });
          }
        });
      }
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, discordId, username }, 'Error executing verify command');
      await safeEditReply(interaction, tracer, {
        content: `❌ Verification failed due to an API or database error. Message: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Helper to build the upgraded rich profile embed card
   */
  private async buildProfileEmbed(
    interaction: ChatInputCommandInteraction,
    profile: UserGetUserLiteResponse,
    tracer?: ProfileTracer
  ): Promise<EmbedBuilder> {
    tracer?.startStage('profile_embed_enrichment', {
      userId: profile._id,
      hasMu: Boolean(profile.mu),
    });

    // 1. Concurrently fetch MU details, Owned MUs, and Rankings in parallel
    const muPromise = (async (): Promise<string> => {
      if (!profile.mu) return 'None';
      tracer?.startStage('warera_fetch_mu', { muId: profile.mu });
      try {
        const mu = await this.wareraService.getMu(profile.mu);
        tracer?.endStage('warera_fetch_mu', { muName: mu.name });
        return mu.name;
      } catch (err) {
        tracer?.errorStage('warera_fetch_mu', err as Error, { muId: profile.mu });
        logger.warn({ error: (err as Error).message, muId: profile.mu }, 'Failed to fetch MU details for profile embed');
        return `ID: ${profile.mu}`;
      }
    })();

    const ownedMusPromise = (async (): Promise<string> => {
      tracer?.startStage('warera_fetch_owned_mus', { userId: profile._id });
      try {
        const ownedMus = await this.wareraService.getOwnedMus(profile._id);
        tracer?.endStage('warera_fetch_owned_mus', { count: ownedMus.length });
        if (ownedMus.length > 0) {
          return ownedMus.map((m) => `• ${m.name}`).join('\n');
        }
        return '';
      } catch (err) {
        tracer?.errorStage('warera_fetch_owned_mus', err as Error, { userId: profile._id });
        logger.warn({ error: (err as Error).message }, 'Failed to fetch owned MUs');
        return '';
      }
    })();

    const totalRankPromise = (async (): Promise<number | null> => {
      tracer?.startStage('warera_fetch_rank_total', { userId: profile._id });
      try {
        const rank = await this.wareraService.getEgyptUserRank(profile._id, 'userDamages');
        tracer?.endStage('warera_fetch_rank_total', { rank: rank ?? 'unranked' });
        return rank;
      } catch (err) {
        tracer?.errorStage('warera_fetch_rank_total', err as Error, { userId: profile._id });
        logger.warn({ error: (err as Error).message }, 'Failed to fetch Egypt rankings');
        return null;
      }
    })();

    const weeklyRankPromise = (async (): Promise<number | null> => {
      tracer?.startStage('warera_fetch_rank_weekly', { userId: profile._id });
      try {
        const rank = await this.wareraService.getEgyptUserRank(profile._id, 'weeklyUserDamages');
        tracer?.endStage('warera_fetch_rank_weekly', { rank: rank ?? 'unranked' });
        return rank;
      } catch (err) {
        tracer?.errorStage('warera_fetch_rank_weekly', err as Error, { userId: profile._id });
        logger.warn({ error: (err as Error).message }, 'Failed to fetch Egypt rankings');
        return null;
      }
    })();

    const [muName, ownedMusList, totalRankNum, weeklyRankNum] = await Promise.all([
      muPromise,
      ownedMusPromise,
      totalRankPromise,
      weeklyRankPromise,
    ]);

    tracer?.endStage('profile_embed_enrichment');

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
      specializationSubText = '\n*🇪🇬 مصر فرحانة بيك.*';
    } else if (economyScore >= warScore * 1.5) {
      specializationText = '🌾 Economy Specialist';
      specializationSubText = '\n*الاخ بيلعب المزرعة السعيدة*';
    }

    // Prepare variables
    const level = profile.leveling?.level !== undefined ? profile.leveling.level : '?';
    const totalDamage = profile.stats?.damagesCount !== undefined ? profile.stats.damagesCount.toLocaleString() : '0';
    const totalDamageRank = totalRankNum ? `#${totalRankNum}` : 'Unranked';
    const weeklyDamage = profile.rankings?.weeklyUserDamages?.value !== undefined ? profile.rankings.weeklyUserDamages.value.toLocaleString() : '0';
    const weeklyDamageRank = weeklyRankNum ? `#${weeklyRankNum}` : 'Unranked';

    const badgeText = profile._id === '6933026bcb40c06497f414f3' ? ' • ☝️ القدوة' : '';

    let activeMuText = muName;
    if (profile.mu === '69ced3d6c23c7a8448383f28') {
      activeMuText += '\n\u200F🏴 تحت حماية الرايات السوداء.';
    }

    const embed = new EmbedBuilder()
      .setColor('#2b2d31') // Modern dark invisible color for premium feel
      .setThumbnail(profile.avatarUrl || 'https://raw.githubusercontent.com/discord/discord-logo-template/master/discord-logo-blue.png')
      .setDescription(`**👤 ${profile.username}${badgeText}**\n**⭐ Level:** ${level}\n\n**${specializationText}**${specializationSubText}`)
      .addFields(
        { name: '⚔ Total Damage', value: `${totalDamage}\n🇪🇬 Egypt Rank: **${totalDamageRank}**`, inline: true },
        { name: '🔥 Weekly Damage', value: `${weeklyDamage}\n🇪🇬 Egypt Rank: **${weeklyDamageRank}**`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }, // Empty field for alignment
        { name: '🏛 Current Active MU', value: activeMuText, inline: false }
      )
      .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

    if (ownedMusList) {
      embed.addFields({ name: '👑 Owned Military Units', value: ownedMusList, inline: false });
    }

    // Special top ranking messages
    const isRank1 = totalRankNum === 1 || weeklyRankNum === 1;
    const isTop10 = (totalRankNum !== null && totalRankNum >= 2 && totalRankNum <= 10) || 
                    (weeklyRankNum !== null && weeklyRankNum >= 2 && weeklyRankNum <= 10);

    if (isRank1) {
      embed.addFields({ name: '\u200B', value: '> **👑 الباشا الكبير**', inline: false });
    } else if (isTop10) {
      embed.addFields({ name: '\u200B', value: '> **💥 اخويا المدرعة الي الضربة منه باربعة**', inline: false });
    }

    return embed;
  }

  /**
   * Handler for /profile
   */
  async profile(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new ProfileTracer(correlationId);
    tracer.startStage('command_init', {
      invokerId: interaction.user.id,
      guildId: interaction.guildId ?? 'dm',
    });

    const memberOption = interaction.options.getUser('member', false);
    const usernameOption = interaction.options.getString('username', false);

    // Dedicated deferReply execution with isolated error tracking & timeout warning
    const deferStart = Date.now();
    tracer.startStage('interaction_defer', {
      invokerId: interaction.user.id,
      guildId: interaction.guildId ?? 'dm',
    });
    logger.info(
      {
        requestId: tracer.requestId,
        command: 'profile',
        invokerId: interaction.user.id,
        guildId: interaction.guildId ?? 'dm',
      },
      'Starting interaction.deferReply()...'
    );

    let deferWarningTimer: NodeJS.Timeout | null = setTimeout(() => {
      logger.warn(
        {
          requestId: tracer.requestId,
          elapsedMs: Date.now() - deferStart,
          command: 'profile',
          invokerId: interaction.user.id,
        },
        'interaction.deferReply() has exceeded 2000ms - risk of Discord 3-second timeout'
      );
    }, 2000);

    try {
      await interaction.deferReply();
      if (deferWarningTimer) clearTimeout(deferWarningTimer);
      const deferDurationMs = Date.now() - deferStart;
      tracer.endStage('interaction_defer');
      logger.info(
        { requestId: tracer.requestId, durationMs: deferDurationMs },
        'interaction.deferReply() completed successfully'
      );
    } catch (deferError: any) {
      if (deferWarningTimer) clearTimeout(deferWarningTimer);
      const deferDurationMs = Date.now() - deferStart;
      const safeErrorMessage = deferError instanceof Error ? deferError.message : String(deferError);
      tracer.errorStage('interaction_defer', deferError, {
        errorCode: deferError?.code,
        status: deferError?.status,
      });
      tracer.complete({ outcome: 'defer_failed', error: safeErrorMessage });
      logger.error(
        {
          requestId: tracer.requestId,
          durationMs: deferDurationMs,
          error: safeErrorMessage,
          code: deferError?.code,
          status: deferError?.status,
        },
        'interaction.deferReply() failed'
      );
      // Since deferReply failed or timed out, the interaction token is invalid/expired.
      // Do not attempt an invalid second response.
      return;
    }

    try {

      // 1. Search by Username Option
      if (usernameOption) {
        tracer.startStage('warera_search_players', { username: usernameOption });
        const profiles = await this.wareraService.searchPlayers(usernameOption);
        tracer.endStage('warera_search_players', { count: profiles.length });

        if (profiles.length === 0) {
          tracer.startStage('discord_edit_reply', { result: 'not_found' });
          await interaction.editReply({
            content: `❌ Could not find any WarEra player matching **${usernameOption}**.`,
          });
          tracer.endStage('discord_edit_reply');
          tracer.complete({ outcome: 'not_found' });
          return;
        }

        if (profiles.length === 1) {
          const profile = profiles[0];
          tracer.startStage('build_profile_embed', { userId: profile._id });
          const embed = await this.buildProfileEmbed(interaction, profile, tracer);
          tracer.endStage('build_profile_embed');

          tracer.startStage('discord_edit_reply', { result: 'single_match' });
          await interaction.editReply({ embeds: [embed] });
          tracer.endStage('discord_edit_reply');
          tracer.complete({ outcome: 'single_match' });
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

        tracer.startStage('discord_edit_reply', { result: 'multiple_matches', count: profiles.length });
        const reply = await interaction.editReply({
          content: '⚠️ Multiple players matched your search. Please select the correct profile:',
          components: [row],
        });
        tracer.endStage('discord_edit_reply');
        tracer.complete({ outcome: 'multiple_matches' });

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

          const menuTracer = new ProfileTracer(`${tracer.requestId}_menu`);
          menuTracer.startStage('menu_collect');

          await menuInteraction.deferUpdate();
          const selectedUserId = menuInteraction.values[0];
          const selectedProfile = profiles.find((p) => p._id === selectedUserId);

          if (!selectedProfile) {
            await menuInteraction.followUp({ content: '❌ Selected profile not found.', ephemeral: true });
            menuTracer.endStage('menu_collect', { error: 'not_found' });
            return;
          }

          const embed = await this.buildProfileEmbed(interaction, selectedProfile, menuTracer);
          await menuInteraction.editReply({
            content: null,
            embeds: [embed],
            components: [],
          });
          menuTracer.endStage('menu_collect', { selectedUserId });
          menuTracer.complete({ outcome: 'menu_selection_success' });
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

      tracer.startStage('db_lookup_link', { targetDiscordId });
      const userLink = await this.verificationService.getLinkByDiscordId(targetDiscordId);
      tracer.endStage('db_lookup_link', { linked: Boolean(userLink) });

      if (!userLink) {
        tracer.startStage('discord_edit_reply', { result: 'unlinked' });
        if (memberOption) {
          await interaction.editReply({
            content: `❌ <@${targetDiscordId}> is not linked to any WarEra profile.`,
          });
        } else {
          await interaction.editReply({
            content: '❌ Your Discord account is not linked to a WarEra profile. Use `/verify <username>` to verify first.',
          });
        }
        tracer.endStage('discord_edit_reply');
        tracer.complete({ outcome: 'unlinked' });
        return;
      }

      // Fetch profile
      tracer.startStage('warera_user_profile', { wareraUserId: userLink.wareraUserId });
      const profile = await this.wareraService.getUserProfile(userLink.wareraUserId);
      tracer.endStage('warera_user_profile', { username: profile.username, level: profile.leveling?.level });

      tracer.startStage('build_profile_embed', { wareraUserId: userLink.wareraUserId });
      const embed = await this.buildProfileEmbed(interaction, profile, tracer);
      tracer.endStage('build_profile_embed');

      tracer.startStage('discord_edit_reply', { result: 'success' });
      await interaction.editReply({ embeds: [embed] });
      tracer.endStage('discord_edit_reply');
      tracer.complete({ outcome: 'success' });
    } catch (error) {
      tracer.errorStage('command_error', error as Error);
      tracer.complete({ outcome: 'error', error: (error as Error).message });
      logger.error({ error: (error as Error).message, usernameOption, memberId: memberOption?.id }, 'Error in profile command');
      
      // deferReply has already succeeded if we reached this catch block.
      // Safely editReply without attempting an invalid second reply.
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: `❌ Failed to retrieve profile: ${(error as Error).message}`,
        }).catch((err) => {
          logger.warn({ error: err.message }, 'Failed to send editReply error message in profile command');
        });
      }
    }
  }

  /**
   * Handler for /sync-me
   */
  async syncMe(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('sync-me', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const discordId = interaction.user.id;
    const member = interaction.member as GuildMember;

    if (!interaction.guild || !member) {
      await interaction.reply({
        content: '❌ This command can only be run within a Discord server.',
        ephemeral: true,
      });
      return;
    }

    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { discordId });
      const userLink = await this.verificationService.getLinkByDiscordId(discordId);
      if (!userLink) {
        await safeEditReply(interaction, tracer, {
          content: '❌ Your Discord account is not linked. Use `/verify <username>` to verify first.',
        });
        return;
      }

      await this.roleSyncService.syncMember(interaction.guild, member, userLink);
      tracer.checkpoint(9, 'work_complete');
      await safeEditReply(interaction, tracer, {
        content: `✅ Your roles have been synchronized based on your latest WarEra stats!`,
      });
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, discordId }, 'Error running /sync-me');
      await safeEditReply(interaction, tracer, {
        content: `❌ Sync failed: ${(error as Error).message}`,
      });
    }
  }
}
