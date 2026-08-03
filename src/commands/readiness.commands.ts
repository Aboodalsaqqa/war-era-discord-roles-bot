import { ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import { ReadinessService } from '../services/readiness.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { logger } from '../utils/logger';

export class ReadinessCommands {
  constructor(
    private readonly readinessService: ReadinessService,
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
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    // Check Permissions
    const isAuthorized = await this.isOfficerOrAdmin(interaction);
    if (!isAuthorized) {
      await interaction.reply({
        content: '❌ You do not have permission to view the Military Readiness Report.',
        ephemeral: true,
      });
      return;
    }

    logger.info({ guildId, userId: interaction.user.id }, 'Generating readiness report command');
    await interaction.deferReply();

    try {
      const report = await this.readinessService.generateReadinessReport(interaction.guild!);

      const embed = new EmbedBuilder()
        .setTitle('🇪🇬 Egypt Ministry of Defense | Military Readiness Report')
        .setColor('#D00000') // Egypt MoD Red
        .addFields(
          {
            name: '👥 Personnel Overview',
            value: `• **Verified Players:** \`${report.verifiedPlayers}\`\n• **War Specialists (Active Military):** \`${report.warSpecialists}\`\n• **Economy Specialists:** \`${report.economySpecialists}\`\n• **Hybrid Players:** \`${report.hybridPlayers}\``,
            inline: false,
          },
          {
            name: '📈 Level Thresholds',
            value: `• **Level 50+:** \`${report.level50Plus}\`\n• **Level 100+:** \`${report.level100Plus}\``,
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

      // Add Active Recruitment Campaign if present
      if (report.activeCampaignTitle) {
        const campaignProgressText = report.campaignProgress
          ? `• **Eligible Players:** \`${report.campaignProgress.eligible}\`\n• **Converted:** \`${report.campaignProgress.converted}\` (${report.campaignProgress.conversionRate.toFixed(1)}%)\n• **Remaining:** \`${report.campaignProgress.remaining}\``
          : 'Progress stats unavailable.';

        embed.addFields({
          name: `📢 Active Mobilization: "${report.activeCampaignTitle}" (Level ${report.activeCampaignMinLevel}+)`,
          value: campaignProgressText,
          inline: false,
        });
      } else {
        embed.addFields({
          name: '📢 Active Mobilization Campaign',
          value: '*No active recruitment campaign.*',
          inline: false,
        });
      }

      // Add Operation Stats
      const opStats = report.operationStats;
      if (opStats.totalOperations > 0) {
        embed.addFields({
          name: '🚨 Operations & Directives Statistics',
          value: `• **Total Operations Launched:** \`${opStats.totalOperations}\`\n• **Direct DMs Dispatched:** \`${opStats.totalSent}\` DMs\n• **Responses Logged:** \`${opStats.totalAvailable + opStats.totalUnavailable}\` (\`✅ ${opStats.totalAvailable}\` / \`❌ ${opStats.totalUnavailable}\`)\n• **Average Response Rate:** \`${opStats.avgResponseRate.toFixed(1)}%\``,
          inline: false,
        });
      } else {
        embed.addFields({
          name: '🚨 Operations & Directives Statistics',
          value: '*No operations logged yet.*',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error({ error: (err as Error).message, guildId }, 'Failed to generate readiness report command');
      await interaction.editReply({
        content: `❌ Failed to generate military readiness report: ${(err as Error).message}`,
      });
    }
  }
}
