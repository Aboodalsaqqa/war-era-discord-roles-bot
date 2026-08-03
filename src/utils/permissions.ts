import { ChatInputCommandInteraction, ButtonInteraction, PermissionFlagsBits, GuildMemberRoleManager } from 'discord.js';
import { prisma } from '../database';

/**
 * Validates if the interacting user has administrative access to the bot.
 * Access is granted if the user is a Discord Administrator OR if they hold
 * the configured Trusted Role for the guild.
 */
export async function hasBotAdminAccess(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<boolean> {
  // 1. Check native Discord Administrator permission
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  // Safety check for guild environment
  if (!interaction.guildId || !interaction.member || !('roles' in interaction.member)) {
    return false;
  }

  // 2. Check against the configured Trusted Role
  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guildId }
    });

    if (config && config.trustedRoleId) {
      const roles = interaction.member.roles as GuildMemberRoleManager;
      if (roles.cache.has(config.trustedRoleId)) {
        return true;
      }
    }
  } catch (error) {
    console.error('Failed to check trusted role permissions:', error);
  }

  return false;
}
