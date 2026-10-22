import { ChatInputCommandInteraction, EmbedBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import { OperationService } from '../services/operation.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { logger } from '../utils/logger';
import { CommandTracer, safeDeferReply, safeEditReply } from '../utils/commandTracer';

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

  async handleCommand(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('operation', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;
    const isPublic = subcommand === 'list' || subcommand === 'status';

    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: !isPublic });
    if (!deferred) return;

    if (!guildId || !interaction.guild) {
      await safeEditReply(interaction, tracer, { content: '❌ This command must be run inside a guild.' });
      return;
    }

    // Check Permissions
    const isAuthorized = await this.isOfficerOrAdmin(interaction);
    if (!isAuthorized) {
      await safeEditReply(interaction, tracer, {
        content: '❌ You do not have permission to use MoD operations commands. Only administrators or configured Officers may use these.',
      });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, guildId, subcommand, userId: interaction.user.id }, 'Executing operation command');

    if (subcommand === 'create') {
      try {
        tracer.checkpoint(9, 'work_start', { action: 'create' });
        const title = interaction.options.getString('title', true);
        const message = interaction.options.getString('message', true);
        const targetType = interaction.options.getString('target-type', true);
        const targetMuId = interaction.options.getString('mu-id', false);
        const targetLevel = interaction.options.getInteger('minimum-level', false);

        // Validations
        if (targetType === 'mu' && !targetMuId) {
          await safeEditReply(interaction, tracer, {
            content: '❌ You must specify a `mu-id` when targeting military units.',
          });
          return;
        }

        if (targetType === 'level' && !targetLevel) {
          await safeEditReply(interaction, tracer, {
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

        await safeEditReply(interaction, tracer, {
          content: `🔄 Operation **"${title}"** registered in database. Dispatching alerts to matching players via DM...`,
        });

        // 2. Dispatch DMs (respects Discord rate-limits)
        const sentCount = await this.operationService.dispatchOperation(
          interaction.client,
          operation.id,
          interaction.user.tag
        );

        tracer.checkpoint(9, 'work_complete', { action: 'create', operationId: operation.id, sentCount });
        await interaction.followUp({
          content: `✅ Operation **"${title}"** created and successfully dispatched to **${sentCount}** players!`,
          ephemeral: true,
        }).catch((err) => {
          logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Failed to send operation followUp');
        });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Failed to create and dispatch operation');
        await safeEditReply(interaction, tracer, { content: `❌ Operation creation failed: ${(err as Error).message}` });
      }
      return;
    }

    if (subcommand === 'list') {
      try {
        tracer.checkpoint(9, 'work_start', { action: 'list' });
        const operations = await this.operationService.listOperations(guildId);
        if (operations.length === 0) {
          tracer.checkpoint(9, 'work_complete', { count: 0 });
          await safeEditReply(interaction, tracer, { content: 'ℹ️ No military operations have been logged in this server.' });
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
          .setTimestamp()
          .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

        tracer.checkpoint(9, 'work_complete', { count: operations.length });
        await safeEditReply(interaction, tracer, { embeds: [embed] });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message }, 'Error listing operations');
        await safeEditReply(interaction, tracer, { content: '❌ Failed to retrieve operations list.' });
      }
      return;
    }

    if (subcommand === 'status') {
      const operationId = interaction.options.getString('operation-id', true);

      try {
        tracer.checkpoint(9, 'work_start', { action: 'status', operationId });
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
          .setTimestamp()
          .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

        tracer.checkpoint(9, 'work_complete', { action: 'status', operationId });
        await safeEditReply(interaction, tracer, { embeds: [embed] });
      } catch (err) {
        tracer.errorCheckpoint(9, 'work_error', err);
        logger.error({ correlationId: tracer.correlationId, error: (err as Error).message, operationId }, 'Error retrieving operation stats');
        await safeEditReply(interaction, tracer, { content: `❌ Failed to retrieve operation status: ${(err as Error).message}` });
      }
      return;
    }
  }
}
