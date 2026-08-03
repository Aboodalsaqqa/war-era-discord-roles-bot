import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { GuildConfigService } from '../services/guildConfig.service';
import { MuRoleService } from '../services/muRole.service';
import { LevelRoleRepository } from '../repositories/levelRole.repository';
import { logger } from '../utils/logger';

export class ConfigCommands {
  constructor(
    private readonly guildConfigService: GuildConfigService,
    private readonly muRoleService: MuRoleService,
    private readonly levelRoleRepo: LevelRoleRepository
  ) {}

  /**
   * Handler for /config <subcommand>
   */
  async configureRoles(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand(true);
    const role = interaction.options.getRole('role', true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ guildId, subcommand, roleId: role.id }, 'Configuring role field');
    await interaction.deferReply({ ephemeral: true });

    try {
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
          await interaction.editReply({ content: '❌ Invalid configuration field.' });
          return;
      }

      await this.guildConfigService.updateConfig(guildId, { [field]: role.id });

      await interaction.editReply({
        content: `✅ Successfully configured the **${fieldLabel}** role to <@&${role.id}> for this guild.`,
      });
    } catch (error) {
      logger.error({ error: (error as Error).message, guildId, subcommand }, 'Failed in configureRoles');
      await interaction.editReply({
        content: `❌ Configuration failed: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Handler for /mu-role <subcommand>
   */
  async configureMuRoles(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ guildId, subcommand }, 'Configuring MU roles');

    if (subcommand === 'list') {
      await interaction.deferReply();
      try {
        const mappings = await this.muRoleService.listMuRoles(guildId);
        if (mappings.length === 0) {
          await interaction.editReply({ content: 'ℹ️ No Military Unit (MU) role mappings configured for this guild.' });
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

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error({ error: (error as Error).message, guildId }, 'Error listing MU roles');
        await interaction.editReply({ content: '❌ Failed to list MU roles.' });
      }
      return;
    }

    // Add or Remove requires deferReply (ephemeral)
    await interaction.deferReply({ ephemeral: true });

    try {
      const muId = interaction.options.getString('mu-id', true);

      if (subcommand === 'add') {
        const role = interaction.options.getRole('role', true);
        const mapping = await this.muRoleService.addMuRole(guildId, muId, role.id);

        await interaction.editReply({
          content: `✅ Mapped MU **${mapping.muName}** (ID: \`${muId}\`) to <@&${role.id}>.`,
        });
      } else if (subcommand === 'remove') {
        const deleted = await this.muRoleService.removeMuRole(guildId, muId);
        if (deleted) {
          await interaction.editReply({
            content: `✅ Removed MU role mapping for **${deleted.muName}** (ID: \`${muId}\`).`,
          });
        } else {
          await interaction.editReply({
            content: `❌ No MU role mapping found for ID \`${muId}\`.`,
          });
        }
      }
    } catch (error) {
      logger.error({ error: (error as Error).message, guildId, subcommand }, 'Error executing MU command');
      await interaction.editReply({
        content: `❌ MU configuration failed: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Handler for /level-role <subcommand>
   */
  async configureLevelRoles(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ guildId, subcommand }, 'Configuring level roles');

    if (subcommand === 'list') {
      await interaction.deferReply();
      try {
        const mappings = await this.levelRoleRepo.listByGuild(guildId);
        if (mappings.length === 0) {
          await interaction.editReply({ content: 'ℹ️ No Level role mappings configured for this guild.' });
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

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error({ error: (error as Error).message, guildId }, 'Error listing level roles');
        await interaction.editReply({ content: '❌ Failed to list Level roles.' });
      }
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const minimumLevel = interaction.options.getInteger('minimum-level', true);

      if (subcommand === 'add') {
        const role = interaction.options.getRole('role', true);
        await this.levelRoleRepo.upsertLevelRole(guildId, minimumLevel, role.id);

        await interaction.editReply({
          content: `✅ Mapped Level **${minimumLevel}+** to <@&${role.id}>.`,
        });
      } else if (subcommand === 'remove') {
        const deleted = await this.levelRoleRepo.deleteLevelRole(guildId, minimumLevel);
        if (deleted) {
          await interaction.editReply({
            content: `✅ Removed Level role mapping for Level **${minimumLevel}**+.`,
          });
        } else {
          await interaction.editReply({
            content: `❌ No Level role mapping found for Level **${minimumLevel}**+.`,
          });
        }
      }
    } catch (error) {
      logger.error({ error: (error as Error).message, guildId, subcommand }, 'Error executing Level command');
      await interaction.editReply({
        content: `❌ Level configuration failed: ${(error as Error).message}`,
      });
    }
  }
}
