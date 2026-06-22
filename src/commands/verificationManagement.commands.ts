import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits
} from 'discord.js';
import { VerificationManagementService, VerifiedUserData } from '../services/verificationManagement.service';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { logger } from '../utils/logger';

export class VerificationManagementCommands {
  constructor(
    private readonly verificationManagementService: VerificationManagementService,
    private readonly guildConfigRepo: GuildConfigRepository
  ) {}

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

  async handleListCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    const isAuthorized = await this.isOfficerOrAdmin(interaction);
    if (!isAuthorized) {
      await interaction.reply({
        content: '❌ You do not have permission to view the verified list. Only administrators or configured Officers may use this.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const filterTrusted = interaction.options.getBoolean('trusted');
    const { trusted, untrusted } = await this.verificationManagementService.getFilteredLinks(guild);

    const totalCount = trusted.length + untrusted.length;
    let listToRender = [];
    let isTrustedFlag = true;

    if (filterTrusted === true) {
      listToRender = trusted;
      isTrustedFlag = true;
    } else if (filterTrusted === false) {
      listToRender = untrusted;
      isTrustedFlag = false;
    } else {
      // Default to showing all, but we need to track if they are trusted for the display.
      // Easiest way: combine them, but keeping the flag. We will just use combined list.
      // But wait, fetchPageProfiles needs the trusted boolean.
      // If no filter, we will handle it in the render logic by checking presence in trusted array.
      listToRender = [...trusted, ...untrusted];
    }

    const totalPages = Math.max(1, Math.ceil(listToRender.length / 10));
    let currentPage = 0;

    const renderPage = async (page: number) => {
      // Instead of passing a single boolean to fetchPageProfiles when combined,
      // we can map the slice here to pass individual trusted status.
      const start = page * 10;
      const end = start + 10;
      const slice = listToRender.slice(start, end);
      
      const pageData = await Promise.all(
        slice.map(async (link) => {
          const isUserTrusted = trusted.some((t) => t.discordId === link.discordId);
          const data = await this.verificationManagementService.fetchPageProfiles([link], isUserTrusted, 0, 1);
          return data[0];
        })
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Verified Users List')
        .setColor('#D00000')
        .setDescription(`**Stats Overview:**\n• Total Verified: **${totalCount}**\n• Trusted: **${trusted.length}**\n• Untrusted: **${untrusted.length}**`)
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • Filter: ${filterTrusted !== null ? (filterTrusted ? 'Trusted Only' : 'Untrusted Only') : 'None'}` });

      if (pageData.length === 0) {
        embed.addFields({ name: 'No users found', value: 'There are no users matching this filter.' });
      }

      for (const item of pageData) {
        const { link, profile, isTrusted } = item;
        const member = guild.members.cache.get(link.discordId);
        const nameStr = member ? `**${member.user.tag}** (<@${link.discordId}>)` : `*Unknown* (<@${link.discordId}>)`;
        
        let valStr = `**WarEra Username:** ${link.wareraUsername}\n`;
        valStr += `**Status:** ${isTrusted ? '🟢 Trusted' : '🔴 Untrusted'}\n`;
        
        if (profile) {
          const spec = this.verificationManagementService.getSpecialization(profile);
          valStr += `**Level:** ${profile.leveling?.level || 0} | **MU:** ${profile.mu || 'None'} | **Spec:** ${spec}\n`;
        } else {
          valStr += `*Could not fetch WarEra profile data.*\n`;
        }
        valStr += `**Verified:** <t:${Math.floor(link.verifiedAt.getTime() / 1000)}:R>`;

        embed.addFields({ name: nameStr, value: valStr });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_page')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('next_page')
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1 || totalPages === 0)
      );

      return { embed, row };
    };

    const initialPage = await renderPage(currentPage);
    const message = await interaction.editReply({ embeds: [initialPage.embed], components: [initialPage.row] });

    if (totalPages > 1) {
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
      });

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: 'You cannot use these buttons.', ephemeral: true });
          return;
        }
        await i.deferUpdate();

        if (i.customId === 'prev_page' && currentPage > 0) currentPage--;
        if (i.customId === 'next_page' && currentPage < totalPages - 1) currentPage++;

        const newPage = await renderPage(currentPage);
        await interaction.editReply({ embeds: [newPage.embed], components: [newPage.row] });
      });

      collector.on('end', async () => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('prev_page').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('next_page').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await interaction.editReply({ components: [disabledRow] }).catch(() => null);
      });
    }
  }

  async handleExportCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: '❌ This command must be run inside a guild.', ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '❌ You must be an Administrator to export the verified users list.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: '🔄 Generating CSV export. This may take a minute depending on the number of verified users...' });

    try {
      const csvData = await this.verificationManagementService.generateCsvExport(guild);
      const buffer = Buffer.from(csvData, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: 'verified_users_export.csv' });

      await interaction.editReply({
        content: '✅ Export complete. See the attached CSV file.',
        files: [attachment]
      });
    } catch (err) {
      logger.error({ err }, 'Failed to generate verified users export');
      await interaction.editReply({ content: `❌ Failed to generate export: ${(err as Error).message}` });
    }
  }
}
