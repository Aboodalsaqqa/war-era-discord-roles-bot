import { Guild, GuildMember, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger';

/**
 * Synchronizes a Discord member's nickname to match their WarEra username.
 * Isolated completely from the rest of the project to ensure safety.
 *
 * @param guild The Discord guild where the member resides.
 * @param member The Discord member to update.
 * @param expectedNickname The intended WarEra username.
 */
export async function syncMemberNickname(
  guild: Guild,
  member: GuildMember,
  expectedNickname: string
): Promise<void> {
  const logCtx = {
    guildId: guild.id,
    userId: member.id,
    expectedNickname,
  };

  try {
    // 1. Skip if nickname already matches
    // If they have no nickname, member.nickname is null. In that case, we check their display name or username.
    const currentName = member.nickname || member.user.globalName || member.user.username;
    if (member.nickname === expectedNickname || (!member.nickname && currentName === expectedNickname)) {
      logger.debug(logCtx, 'Nickname already matches the expected WarEra username. Skipping synchronization.');
      return;
    }

    // 2. Cannot change the Guild Owner's nickname
    if (member.id === guild.ownerId) {
      logger.info(logCtx, 'Cannot change the nickname of the Guild Owner. Skipping.');
      return;
    }

    // 3. Bot Context and Permission Checks
    const me = guild.members.me || await guild.members.fetch({ user: guild.client.user.id, force: true }).catch(() => null);
    
    if (!me) {
      logger.error(logCtx, 'Failed to fetch the bot member object for nickname synchronization.');
      return;
    }

    if (!me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      logger.info(logCtx, 'Bot lacks ManageNicknames permission in this guild. Cannot synchronize nickname.');
      return;
    }

    // 4. Role Hierarchy Check
    const botHighestRole = me.roles.highest;
    const memberHighestRole = member.roles.highest;

    if (memberHighestRole.position >= botHighestRole.position) {
      logger.info(
        logCtx,
        `Cannot change nickname: Member's highest role (${memberHighestRole.name}) is higher than or equal to the bot's highest role (${botHighestRole.name}).`
      );
      return;
    }

    // 5. Execution
    await member.setNickname(expectedNickname, 'WarEra Username Synchronization');
    logger.info(logCtx, `Successfully synchronized nickname to ${expectedNickname}`);
  } catch (error) {
    // 6. Never crash if Discord refuses the request
    logger.error(
      { ...logCtx, error: (error as Error).message },
      'Failed to synchronize member nickname due to an API error.'
    );
  }
}
