import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MuRoleRepository } from '../repositories/muRole.repository';
import { WarEraService } from '../warera/service';
import { logger } from '../utils/logger';

export class AuditCommands {
  constructor(
    private readonly muRoleRepo: MuRoleRepository,
    private readonly wareraService: WarEraService
  ) {}

  /**
   * Handler for /mu-audit
   */
  async muAudit(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    logger.info({ adminId: interaction.user.id }, 'Executing /mu-audit');
    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Fetch all Egypt MUs from WarEra API and sort alphabetically
      const egyptMus = await this.wareraService.getAllEgyptMus();
      egyptMus.sort((a, b) => a.name.localeCompare(b.name));

      // 2. Fetch existing DB mappings for this guild
      const dbMappings = await this.muRoleRepo.listByGuild(guild.id);

      // 3. Fetch Discord Roles
      const guildRoles = guild.roles.cache;

      // --- Cross-Referencing Logic ---

      const missingMus: { name: string; id: string }[] = [];
      const configuredMus: { name: string; id: string; roleId: string }[] = [];
      
      const duplicateMappings: string[] = [];
      const brokenMappings: { name: string; id: string; roleId: string }[] = [];
      const orphanMappings: { name: string; id: string; roleId: string }[] = [];

      // Check MUs from API against mappings
      for (const mu of egyptMus) {
        const mappingsForMu = dbMappings.filter((m) => m.muId === mu._id);

        if (mappingsForMu.length === 0) {
          missingMus.push({ name: mu.name, id: mu._id });
        } else {
          if (mappingsForMu.length > 1) {
            duplicateMappings.push(mu.name);
          }

          // Just take the first for the general configured list
          const mapping = mappingsForMu[0];
          configuredMus.push({ name: mu.name, id: mu._id, roleId: mapping.discordRoleId });
        }
      }

      // Check mappings against Discord roles & WarEra API for orphans/broken
      const egyptMuIds = new Set(egyptMus.map((m) => m._id));

      for (const mapping of dbMappings) {
        // Broken check
        if (!guildRoles.has(mapping.discordRoleId)) {
          brokenMappings.push({ name: mapping.muName, id: mapping.muId, roleId: mapping.discordRoleId });
        }

        // Orphan check
        if (!egyptMuIds.has(mapping.muId)) {
          orphanMappings.push({ name: mapping.muName, id: mapping.muId, roleId: mapping.discordRoleId });
        }
      }

      const totalMus = egyptMus.length;
      const configuredCount = configuredMus.length;
      const missingCount = missingMus.length;
      const coverage = totalMus > 0 ? ((configuredCount / totalMus) * 100).toFixed(1) : '0.0';

      // --- Pagination Setup ---
      const embeds: EmbedBuilder[] = [];

      // Page 1: Executive Summary
      const summaryEmbed = new EmbedBuilder()
        .setTitle('📊 Egypt MU Audit Summary')
        .setColor('#0099ff')
        .setDescription(
          `**Total Egyptian MUs:** ${totalMus}\n` +
          `**Configured:** ${configuredCount}\n` +
          `**Missing:** ${missingCount}\n` +
          `**Coverage:** ${coverage}%\n\n` +
          `**Mapped Roles Found:** ${configuredCount}\n` +
          `**Broken Roles:** ${brokenMappings.length}\n` +
          `**Missing Roles:** ${missingCount}\n` +
          `**Orphan Mappings:** ${orphanMappings.length}`
        )
        .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });

      if (missingMus.length > 0) {
        const missingList = missingMus.map((m) => `❌ **${m.name}**\n\`/mu-role add mu-id:${m.id} role:\``).join('\n\n');
        // Truncate if too long for embed field
        const truncatedList = missingList.length > 1000 ? missingList.substring(0, 1000) + '... (truncated)' : missingList;
        summaryEmbed.addFields({ name: 'Missing MU Role Mappings', value: truncatedList });
      } else {
        summaryEmbed.addFields({ name: 'Missing MU Role Mappings', value: '🎉 All Egyptian Military Units are correctly configured.' });
      }

      // Advanced Checks Fields
      if (duplicateMappings.length > 0) {
        summaryEmbed.addFields({ name: '⚠️ Duplicate Mappings', value: duplicateMappings.join(', ') });
      }
      if (brokenMappings.length > 0) {
        summaryEmbed.addFields({ 
          name: '💔 Broken Mappings (Role Deleted)', 
          value: brokenMappings.map(b => `${b.name} (Role ID: ${b.roleId})`).join('\n') 
        });
      }
      if (orphanMappings.length > 0) {
        summaryEmbed.addFields({ 
          name: '👻 Orphan Mappings (MU not in Egypt anymore)', 
          value: orphanMappings.map(o => `${o.name} (ID: ${o.id})`).join('\n') 
        });
      }

      embeds.push(summaryEmbed);

      // Pages 2+: MU Details (10 per page)
      const detailsPerPage = 10;
      let currentPageDetailText = '';
      let detailPageCount = 1;

      for (let i = 0; i < egyptMus.length; i++) {
        const mu = egyptMus[i];
        const isConfigured = configuredMus.find(c => c.id === mu._id);

        let statusText = `❌ Missing Role Mapping\n\`/mu-role add mu-id:${mu._id} role:\``;
        if (isConfigured) {
          statusText = `✅ Configured\n**Role:** <@&${isConfigured.roleId}>`;
        }

        currentPageDetailText += `**• MU Name:** ${mu.name}\n**• MU ID:** \`${mu._id}\`\n**• Discord Role Status:**\n${statusText}\n\n`;

        if ((i + 1) % detailsPerPage === 0 || i === egyptMus.length - 1) {
          const detailEmbed = new EmbedBuilder()
            .setTitle(`📋 MU Details (Part ${detailPageCount})`)
            .setColor('#2F3136')
            .setDescription(currentPageDetailText)
            .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' });
          
          embeds.push(detailEmbed);
          currentPageDetailText = '';
          detailPageCount++;
        }
      }

      // Overall color based on coverage
      if (missingCount === 0 && brokenMappings.length === 0 && orphanMappings.length === 0) {
        summaryEmbed.setColor('#00FF00'); // Green
      } else if (missingCount > 0 && configuredCount > 0) {
        summaryEmbed.setColor('#FFFF00'); // Yellow
      } else {
        summaryEmbed.setColor('#FF0000'); // Red
      }

      // --- Interactive Message logic ---
      let currentPageIndex = 0;

      const getActionRow = (index: number) => {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('mu_audit_prev')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(index === 0),
          new ButtonBuilder()
            .setCustomId('mu_audit_next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(index === embeds.length - 1)
        );
      };

      if (embeds.length === 1) {
        await interaction.editReply({ embeds: [embeds[0]] });
        return;
      }

      const reply = await interaction.editReply({
        embeds: [embeds[currentPageIndex]],
        components: [getActionRow(currentPageIndex)],
      });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
      });

      collector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) {
          await btnInteraction.reply({ content: 'Only the command executor can paginate.', ephemeral: true });
          return;
        }

        if (btnInteraction.customId === 'mu_audit_prev') {
          currentPageIndex = Math.max(0, currentPageIndex - 1);
        } else if (btnInteraction.customId === 'mu_audit_next') {
          currentPageIndex = Math.min(embeds.length - 1, currentPageIndex + 1);
        }

        await btnInteraction.update({
          embeds: [embeds[currentPageIndex]],
          components: [getActionRow(currentPageIndex)],
        });
      });

      collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => null);
      });

    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error in muAudit command');
      await interaction.editReply({ content: `❌ An error occurred during the MU Audit: ${(error as Error).message}` });
    }
  }
}
