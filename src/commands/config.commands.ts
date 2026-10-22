import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { GuildConfigService } from '../services/guildConfig.service';
import { MuRoleService } from '../services/muRole.service';
import { LevelRoleRepository } from '../repositories/levelRole.repository';
import { logger } from '../utils/logger';
import { CommandTracer, safeDeferReply, safeEditReply } from '../utils/commandTracer';

export class ConfigCommands {
  constructor(
    private readonly guildConfigService: GuildConfigService,
    private readonly muRoleService: MuRoleService,
    private readonly levelRoleRepo: LevelRoleRepository
  ) {}

  /**
   * Handler for /config <subcommand>
   */
  async configureRoles(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('config', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const subcommand = interaction.options.getSubcommand(true);
    const role = interaction.options.getRole('role', true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, guildId, subcommand, roleId: role.id }, 'Configuring role field');
    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { subcommand, roleId: role.id });
      let field: string;
      let fieldLabel: string;

      switch (subcommand) {
        case 'citizen-role':
          field = 'citizenRoleId';
          fieldLabel = '🇪🇬 Egypt Citizen';
          break;
        case 'officer-role':
          field = 'officerRoleId';
          fieldLabel = '🛡️ Officer';
          break;
        case 'vice-president-role':
          field = 'vicePresidentRoleId';
          fieldLabel = '🎖️ Vice President';
          break;
        case 'congress-role':
          field = 'congressRoleId';
          fieldLabel = '🏛️ Congress Member';
          break;
        case 'war-role':
          field = 'warRoleId';
          fieldLabel = '⚔️ War Specialist';
          break;
        case 'economy-role':
          field = 'economyRoleId';
          fieldLabel = '🏭 Economy Specialist';
          break;
        case 'hybrid-role':
          field = 'hybridRoleId';
          fieldLabel = '⚖️ Hybrid Specialist';
          break;
        case 'trusted-role':
          field = 'trustedRoleId';
          fieldLabel = '🤝 Trusted';
          break;
        case 'mu-commander-role':
          field = 'muCommanderRoleId';
          fieldLabel = '🎖️ MU Commander';
          break;
        case 'mu-owner-role':
          field = 'muOwnerRoleId';
          fieldLabel = '👑 MU Owner';
          break;
        case 'no-mu-role':
          field = 'noMuRoleId';
          fieldLabel = '⛺ No MU Yet';
          break;
        default:
          tracer.checkpoint(9, 'work_complete', { outcome: 'invalid_field' });
          await safeEditReply(interaction, tracer, { content: '❌ Invalid configuration field.' });
          return;
      }

      await this.guildConfigService.updateConfig(guildId, { [field]: role.id });
      tracer.checkpoint(9, 'work_complete', { field, roleId: role.id });

      await safeEditReply(interaction, tracer, {
        content: `✅ Successfully configured the **${fieldLabel}** role to <@&${role.id}> for this guild.`,
      });
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, guildId, subcommand }, 'Failed in configureRoles');
      await safeEditReply(interaction, tracer, {
        content: `❌ Configuration failed: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Handler for /mu-role <subcommand>
   */
  async configureMuRoles(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('mu-role', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, guildId, subcommand }, 'Configuring MU roles');

    if (subcommand === 'list') {
      const deferred = await safeDeferReply(interaction, tracer, { ephemeral: false });
      if (!deferred) return;

      try {
        tracer.checkpoint(9, 'work_start', { action: 'list' });
        const mappings = await this.muRoleService.listMuRoles(guildId);
        if (mappings.length === 0) {
          tracer.checkpoint(9, 'work_complete', { count: 0 });
          await safeEditReply(interaction, tracer, { content: 'ℹ️ No Military Unit (MU) role mappings configured for this guild.' });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🎖️ Military Unit (MU) Role Mappings')
          .setColor('#0099FF')
          .setDescription(
            mappings
              .map((m) => `• **${m.muName}** (ID: \`${m.muId}\`) ➡️ <@&${m.discordRoleId}>`)
              .join('\n')
          )
          .setTimestamp()
          .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

        tracer.checkpoint(9, 'work_complete', { count: mappings.length });
        await safeEditReply(interaction, tracer, { embeds: [embed] });
      } catch (error) {
        tracer.errorCheckpoint(9, 'work_error', error);
        logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, guildId }, 'Error listing MU roles');
        await safeEditReply(interaction, tracer, { content: '❌ Failed to list MU roles.' });
      }
      return;
    }

    // Add or Remove requires deferReply (ephemeral)
    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { action: subcommand });
      const muId = interaction.options.getString('mu-id', true);

      if (subcommand === 'add') {
        const role = interaction.options.getRole('role', true);
        const mapping = await this.muRoleService.addMuRole(guildId, muId, role.id);

        tracer.checkpoint(9, 'work_complete', { action: 'add', muId, roleId: role.id });
        await safeEditReply(interaction, tracer, {
          content: `✅ Mapped MU **${mapping.muName}** (ID: \`${muId}\`) to <@&${role.id}>.`,
        });
      } else if (subcommand === 'remove') {
        const deleted = await this.muRoleService.removeMuRole(guildId, muId);
        tracer.checkpoint(9, 'work_complete', { action: 'remove', muId, found: !!deleted });
        if (deleted) {
          await safeEditReply(interaction, tracer, {
            content: `✅ Removed MU role mapping for **${deleted.muName}** (ID: \`${muId}\`).`,
          });
        } else {
          await safeEditReply(interaction, tracer, {
            content: `❌ No MU role mapping found for ID \`${muId}\`.`,
          });
        }
      }
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, guildId, subcommand }, 'Error executing MU command');
      await safeEditReply(interaction, tracer, {
        content: `❌ MU configuration failed: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Handler for /level-role <subcommand>
   */
  async configureLevelRoles(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('level-role', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ correlationId: tracer.correlationId, guildId, subcommand }, 'Configuring level roles');

    if (subcommand === 'list') {
      const deferred = await safeDeferReply(interaction, tracer, { ephemeral: false });
      if (!deferred) return;

      try {
        tracer.checkpoint(9, 'work_start', { action: 'list' });
        const mappings = await this.levelRoleRepo.listByGuild(guildId);
        if (mappings.length === 0) {
          tracer.checkpoint(9, 'work_complete', { count: 0 });
          await safeEditReply(interaction, tracer, { content: 'ℹ️ No Level role mappings configured for this guild.' });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('📈 Level Role Mappings')
          .setColor('#00FF66')
          .setDescription(
            mappings
              .map((m) => `• **Level ${m.minimumLevel}+** ➡️ <@&${m.discordRoleId}>`)
              .join('\n')
          )
          .setTimestamp()
          .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

        tracer.checkpoint(9, 'work_complete', { count: mappings.length });
        await safeEditReply(interaction, tracer, { embeds: [embed] });
      } catch (error) {
        tracer.errorCheckpoint(9, 'work_error', error);
        logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, guildId }, 'Error listing level roles');
        await safeEditReply(interaction, tracer, { content: '❌ Failed to list Level roles.' });
      }
      return;
    }

    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: true });
    if (!deferred) return;

    try {
      tracer.checkpoint(9, 'work_start', { action: subcommand });
      const minimumLevel = interaction.options.getInteger('minimum-level', true);

      if (subcommand === 'add') {
        const role = interaction.options.getRole('role', true);
        const mapping = await this.levelRoleRepo.upsertLevelRole(guildId, minimumLevel, role.id);

        tracer.checkpoint(9, 'work_complete', { action: 'add', minimumLevel, roleId: role.id });
        await safeEditReply(interaction, tracer, {
          content: `✅ Mapped **Level ${mapping.minimumLevel}+** to <@&${role.id}>.`,
        });
      } else if (subcommand === 'remove') {
        const deleted = await this.levelRoleRepo.deleteLevelRole(guildId, minimumLevel);
        tracer.checkpoint(9, 'work_complete', { action: 'remove', minimumLevel, found: !!deleted });
        if (deleted) {
          await safeEditReply(interaction, tracer, {
            content: `✅ Removed Level role mapping for **Level ${minimumLevel}+**.`,
          });
        } else {
          await safeEditReply(interaction, tracer, {
            content: `❌ No Level role mapping found for Level ${minimumLevel}.`,
          });
        }
      }
    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error: (error as Error).message, guildId, subcommand }, 'Error executing Level command');
      await safeEditReply(interaction, tracer, {
        content: `❌ Level role configuration failed: ${(error as Error).message}`,
      });
    }
  }
}
