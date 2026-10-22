import { ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import { RecruitmentService } from '../services/recruitment.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { logger } from '../utils/logger';
import { CommandTracer, safeDeferReply, safeEditReply } from '../utils/commandTracer';

export class RecruitmentCommands {
  constructor(
    private readonly recruitmentService: RecruitmentService,
    private readonly guildConfigRepo: GuildConfigRepository
  ) {}

  /**
   * Helper to check if member is admin or has configured officer role
   */
  private async isOfficerOrAdmin(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const member = interaction.member as GuildMember;
    if (!member) return false;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    const config = await this.guildConfigRepo.getByGuildId(interaction.guildId || '');
    if (config && config.officerRoleId) {
      return member.roles.cache.has(config.officerRoleId);
    }

    return false;
  }

  async handleCommand(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('recruitment', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;
    const isPublic = subcommand === 'status' || subcommand === 'report';

    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: !isPublic });
    if (!deferred) return;

    if (!guildId || !interaction.guild) {
      await safeEditReply(interaction, tracer, { content: '❌ This command must be run inside a guild.' });
      return;
    }

    // 1. Check Permissions
    const isAuthorized = await this.isOfficerOrAdmin(interaction);
    if (!isAuthorized) {
      await safeEditReply(interaction, tracer, {
        content: '❌ You do not have permission to use MoD recruitment commands. Only administrators or configured Officers may use these.',
      });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, guildId, subcommand, userId: interaction.user.id }, 'Executing recruitment command');

    if (subcommand === 'start') {
      try {
        tracer.checkpoint(9, 'work_start', { action: 'start' });
        const title = interaction.options.getString('title', true);
        const minimumLevel = interaction.options.getInteger('minimum-level', true);

        const campaign = await this.recruitmentService.startCampaign(
          guildId,
          title,
          minimumLevel,
          interaction.user.id
        );

        tracer.checkpoint(9, 'work_complete', { action: 'start', campaignId: campaign.id });
        await safeEditReply(interaction, tracer, {
          content: `✅ Recruitment campaign **"${campaign.title}"** started successfully for players Level **${campaign.minimumLevel}+**.`,
        });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Error starting recruitment campaign');
        await safeEditReply(interaction, tracer, { content: `❌ Failed to start campaign: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'stop') {
      try {
        tracer.checkpoint(9, 'work_start', { action: 'stop' });
        const campaign = await this.recruitmentService.stopCampaign(guildId);
        tracer.checkpoint(9, 'work_complete', { action: 'stop', found: !!campaign });
        if (campaign) {
          await safeEditReply(interaction, tracer, {
            content: `✅ Recruitment campaign **"${campaign.title}"** stopped.`,
          });
        } else {
          await safeEditReply(interaction, tracer, {
            content: '❌ There is no active recruitment campaign to stop.',
          });
        }
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Error stopping recruitment campaign');
        await safeEditReply(interaction, tracer, { content: `❌ Failed to stop campaign: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'exempt' || subcommand === 'unexempt') {
      try {
        tracer.checkpoint(9, 'work_start', { action: subcommand });
        const targetUser = interaction.options.getUser('user', true);
        const exempt = subcommand === 'exempt';

        await this.recruitmentService.setExemption(targetUser.id, exempt);

        tracer.checkpoint(9, 'work_complete', { action: subcommand, targetId: targetUser.id });
        await safeEditReply(interaction, tracer, {
          content: exempt
            ? `✅ Exempted <@${targetUser.id}> from recruitment reminders.`
            : `✅ Removed exemption for <@${targetUser.id}>. They will now receive recruitment reminders if eligible.`,
        });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Error setting exemption');
        await safeEditReply(interaction, tracer, { content: `❌ Exemption update failed: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'status') {
      try {
        tracer.checkpoint(9, 'work_start', { action: 'status' });
        const stats = await this.recruitmentService.getCampaignStats(interaction.guild);
        
        const embed = new EmbedBuilder()
          .setTitle(`📈 Recruitment Campaign Status`)
          .setColor('#FF9900')
          .addFields(
            { name: 'Campaign Title', value: stats.campaign.title, inline: false },
            { name: 'Minimum Level', value: `${stats.campaign.minimumLevel}`, inline: true },
            { name: 'Eligible Players', value: `${stats.eligibleCount}`, inline: true },
            { name: 'Converted (War Spec)', value: `${stats.convertedCount}`, inline: true },
            { name: 'Remaining (Economy/Hybrid)', value: `${stats.remainingCount}`, inline: true }
          )
          .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' })
          .setTimestamp();

        tracer.checkpoint(9, 'work_complete', { action: 'status' });
        await safeEditReply(interaction, tracer, { embeds: [embed] });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Error retrieving campaign status');
        await safeEditReply(interaction, tracer, { content: `❌ Failed to retrieve status: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'report') {
      try {
        tracer.checkpoint(9, 'work_start', { action: 'report' });
        const report = await this.recruitmentService.getDetailedReport(interaction.guild);

        const embed = new EmbedBuilder()
          .setTitle(`📊 Recruitment Mobilization Report`)
          .setDescription(`Campaign: **"${report.campaign.title}"** (Level ${report.campaign.minimumLevel}+)`)
          .setColor('#D00000') // MoD Egypt Red
          .addFields(
            { name: 'Eligible Players', value: `${report.eligibleCount}`, inline: true },
            { name: 'Converted Players', value: `${report.convertedCount}`, inline: true },
            { name: 'Remaining Players', value: `${report.remainingCount}`, inline: true },
            { name: 'Overall Conversion Rate', value: `${report.conversionRate.toFixed(1)}%`, inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

        // Add MU Breakdown fields
        if (report.muBreakdown.length > 0) {
          const muList = report.muBreakdown
            .map((mu) => {
              const rate = mu.eligible > 0 ? (mu.converted / mu.eligible) * 100 : 0;
              return `• **${mu.muName}**: \`${mu.converted}/${mu.eligible}\` converted (${rate.toFixed(0)}%)`;
            })
            .join('\n');
          embed.addFields({ name: 'Conversion by Military Unit (MU)', value: muList, inline: false });
        } else {
          embed.addFields({ name: 'Conversion by Military Unit (MU)', value: 'No MU members registered/eligible.', inline: false });
        }

        tracer.checkpoint(9, 'work_complete', { action: 'report' });
        await safeEditReply(interaction, tracer, { embeds: [embed] });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Error generating recruitment report');
        await safeEditReply(interaction, tracer, { content: `❌ Failed to generate report: ${(err as Error).message}` });
      }
      return;
    }
  }
}
