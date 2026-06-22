import { ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import { OperationService } from '../services/operation.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { logger } from '../utils/logger';

export class OperationCommands {
  constructor(
    private readonly operationService: OperationService,
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

    // Check Permissions
    const isAuthorized = await this.isOfficerOrAdmin(interaction);
    if (!isAuthorized) {
      await interaction.reply({
        content: '❌ You do not have permission to use MoD operations commands. Only administrators or configured Officers may use these.',
        ephemeral: true,
      });
      return;
    }

    logger.info({ guildId, subcommand, userId: interaction.user.id }, 'Executing operation command');

    if (subcommand === 'create') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const title = interaction.options.getString('title', true);
        const message = interaction.options.getString('message', true);
        const targetType = interaction.options.getString('target-type', true);
        const targetMuId = interaction.options.getString('mu-id', false);
        const targetLevel = interaction.options.getInteger('minimum-level', false);

        // Validations
        if (targetType === 'mu' && !targetMuId) {
          await interaction.editReply({
            content: '❌ You must specify a `mu-id` when targeting military units.',
          });
          return;
        }

        if (targetType === 'level' && !targetLevel) {
          await interaction.editReply({
            content: '❌ You must specify a `minimum-level` when targeting levels.',
          });
          return;
        }

        // 1. Create in DB
        const operation = await this.operationService.createOperation(
          guildId,
          title,
          message,
          targetType,
          targetMuId,
          targetLevel,
          interaction.user.id
        );

        await interaction.editReply({
          content: `🔄 Operation **"${title}"** registered in database. Dispatching alerts to matching players via DM...`,
        });

        // 2. Dispatch DMs (respects Discord rate-limits)
        const sentCount = await this.operationService.dispatchOperation(
          interaction.client,
          operation.id,
          interaction.user.tag
        );

        await interaction.followUp({
          content: `✅ Operation **"${title}"** created and successfully dispatched to **${sentCount}** players!`,
          ephemeral: true,
        });
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Failed to create and dispatch operation');
        await interaction.editReply({ content: `❌ Operation creation failed: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'list') {
      await interaction.deferReply();
      try {
        const operations = await this.operationService.listOperations(guildId);
        if (operations.length === 0) {
          await interaction.editReply({ content: 'ℹ️ No military operations have been logged in this server.' });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🚨 Registered Military Operations')
          .setColor('#CC0000')
          .setDescription(
            operations
              .slice(0, 15) // Limit to top 15
              .map((op) => {
                let targetLabel = op.targetType.toUpperCase();
                if (op.targetType === 'mu') targetLabel = `MU ID: ${op.targetMuId}`;
                if (op.targetType === 'level') targetLabel = `Level ${op.targetLevel}+`;
                return `• **${op.title}** (Target: \`${targetLabel}\`)\n  ID: \`${op.id}\` — <t:${Math.floor(op.createdAt.getTime() / 1000)}:R>`;
              })
              .join('\n\n')
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error listing operations');
        await interaction.editReply({ content: '❌ Failed to retrieve operations list.' });
      }
      return;
    }

    if (subcommand === 'status') {
      const operationId = interaction.options.getString('operation-id', true);
      await interaction.deferReply();

      try {
        const stats = await this.operationService.getOperationStats(operationId);
        
        let targetDetail = stats.operation.targetType.toUpperCase();
        if (stats.operation.targetType === 'mu') targetDetail = `MU ID: ${stats.operation.targetMuId}`;
        if (stats.operation.targetType === 'level') targetDetail = `Level ${stats.operation.targetLevel}+`;

        const embed = new EmbedBuilder()
          .setTitle(`🚨 Operation Status: ${stats.operation.title}`)
          .setDescription(`Objective: *${stats.operation.message}*`)
          .setColor('#CC0000')
          .addFields(
            { name: 'Target Audience', value: `\`${targetDetail}\``, inline: true },
            { name: 'Created At', value: `<t:${Math.floor(stats.operation.createdAt.getTime() / 1000)}:f>`, inline: true },
            { name: '\u200B', value: '\u200B', inline: false }, // Spacer
            { name: 'DMs Dispatched', value: `${stats.sentToCount}`, inline: true },
            { name: '✅ Available', value: `${stats.availableCount}`, inline: true },
            { name: '❌ Unavailable', value: `${stats.unavailableCount}`, inline: true },
            { name: '⏳ No Response', value: `${stats.noResponseCount}`, inline: true },
            { name: '📊 Response Rate', value: `${stats.responseRate.toFixed(1)}%`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error({ error: (err as Error).message, operationId }, 'Error retrieving operation stats');
        await interaction.editReply({ content: `❌ Failed to retrieve operation status: ${(err as Error).message}` });
      }
      return;
    }
  }
}
