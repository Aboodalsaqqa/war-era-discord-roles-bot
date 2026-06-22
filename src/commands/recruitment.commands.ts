import { ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import { RecruitmentService } from '../services/recruitment.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { logger } from '../utils/logger';

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

  async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    // 1. Check Permissions
    const isAuthorized = await this.isOfficerOrAdmin(interaction);
    if (!isAuthorized) {
      await interaction.reply({
        content: '❌ You do not have permission to use MoD recruitment commands. Only administrators or configured Officers may use these.',
        ephemeral: true,
      });
      return;
    }

    logger.info({ guildId, subcommand, userId: interaction.user.id }, 'Executing recruitment command');

    if (subcommand === 'start') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const title = interaction.options.getString('title', true);
        const minimumLevel = interaction.options.getInteger('minimum-level', true);

        const campaign = await this.recruitmentService.startCampaign(
          guildId,
          title,
          minimumLevel,
          interaction.user.id
        );

        await interaction.editReply({
          content: `✅ Recruitment campaign **"${campaign.title}"** started successfully for players Level **${campaign.minimumLevel}+**.`,
        });
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error starting recruitment campaign');
        await interaction.editReply({ content: `❌ Failed to start campaign: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'stop') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const campaign = await this.recruitmentService.stopCampaign(guildId);
        if (campaign) {
          await interaction.editReply({
            content: `✅ Recruitment campaign **"${campaign.title}"** stopped.`,
          });
        } else {
          await interaction.editReply({
            content: '❌ There is no active recruitment campaign to stop.',
          });
        }
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error stopping recruitment campaign');
        await interaction.editReply({ content: `❌ Failed to stop campaign: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'exempt' || subcommand === 'unexempt') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const targetUser = interaction.options.getUser('user', true);
        const exempt = subcommand === 'exempt';

        await this.recruitmentService.setExemption(targetUser.id, exempt);

        await interaction.editReply({
          content: exempt
            ? `✅ Exempted <@${targetUser.id}> from recruitment reminders.`
            : `✅ Removed exemption for <@${targetUser.id}>. They will now receive recruitment reminders if eligible.`,
        });
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error setting exemption');
        await interaction.editReply({ content: `❌ Exemption update failed: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'status') {
      await interaction.deferReply();
      try {
        const stats = await this.recruitmentService.getCampaignStats(interaction.guild!);
        
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
          .setFooter({ text: 'Egypt MoD Campaign Status' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error retrieving campaign status');
        await interaction.editReply({ content: `❌ Failed to retrieve status: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'report') {
      await interaction.deferReply();
      try {
        const report = await this.recruitmentService.getDetailedReport(interaction.guild!);

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
          .setTimestamp();

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

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error generating recruitment report');
        await interaction.editReply({ content: `❌ Failed to generate report: ${(err as Error).message}` });
      }
      return;
    }
  }
}
