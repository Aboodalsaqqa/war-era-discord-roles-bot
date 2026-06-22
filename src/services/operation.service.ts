import { Operation, OperationResponse } from '@prisma/client';
import { prisma } from '../database';
import { WarEraService } from '../warera/service';
import { Client, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger';

export interface OperationStats {
  operation: Operation;
  sentToCount: number;
  availableCount: number;
  unavailableCount: number;
  noResponseCount: number;
  responseRate: number;
}

export class OperationService {
  constructor(private readonly wareraService: WarEraService) {}

  /**
   * Registers a new operation alert in the database
   */
  async createOperation(
    guildId: string,
    title: string,
    message: string,
    targetType: string,
    targetMuId: string | null,
    targetLevel: number | null,
    createdBy: string
  ): Promise<Operation> {
    logger.info({ guildId, title, targetType }, 'Creating operation in database');
    return prisma.operation.create({
      data: {
        guildId,
        title,
        message,
        targetType,
        targetMuId,
        targetLevel,
        createdBy,
      },
    });
  }

  /**
   * Records a user's availability response to an operation
   */
  async recordResponse(
    operationId: string,
    discordId: string,
    response: 'available' | 'unavailable'
  ): Promise<OperationResponse> {
    logger.info({ operationId, discordId, response }, 'Recording operation response');
    return prisma.operationResponse.upsert({
      where: {
        operationId_discordId: {
          operationId,
          discordId,
        },
      },
      update: {
        response,
      },
      create: {
        operationId,
        discordId,
        response,
      },
    });
  }

  /**
   * Lists all operations registered for a guild
   */
  async listOperations(guildId: string): Promise<Operation[]> {
    return prisma.operation.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gets stats for a specific operation
   */
  async getOperationStats(operationId: string): Promise<OperationStats> {
    const operation = await prisma.operation.findUnique({
      where: { id: operationId },
    });

    if (!operation) {
      throw new Error(`Operation with ID ${operationId} not found.`);
    }

    const responses = await prisma.operationResponse.findMany({
      where: { operationId },
    });

    let availableCount = 0;
    let unavailableCount = 0;

    for (const r of responses) {
      if (r.response === 'available') {
        availableCount++;
      } else if (r.response === 'unavailable') {
        unavailableCount++;
      }
    }

    const sentToCount = operation.sentToCount;
    const noResponseCount = Math.max(0, sentToCount - availableCount - unavailableCount);
    const responseRate = sentToCount > 0 ? ((availableCount + unavailableCount) / sentToCount) * 100 : 0;

    return {
      operation,
      sentToCount,
      availableCount,
      unavailableCount,
      noResponseCount,
      responseRate,
    };
  }

  /**
   * Helper to calculate user specialization from skills
   */
  private getSpecialization(skills: any): 'war' | 'economy' | 'hybrid' {
    const warScore =
      (skills.attack?.level || 0) +
      (skills.precision?.level || 0) +
      (skills.criticalChance?.level || 0) +
      (skills.criticalDamages?.level || 0) +
      (skills.armor?.level || 0) +
      (skills.dodge?.level || 0) +
      (skills.lootChance?.level || 0);

    const economyScore =
      (skills.production?.level || 0) +
      (skills.management?.level || 0) +
      (skills.entrepreneurship?.level || 0) +
      (skills.companies?.level || 0);

    if (warScore >= economyScore * 1.5) {
      return 'war';
    } else if (economyScore >= warScore * 1.5) {
      return 'economy';
    } else {
      return 'hybrid';
    }
  }

  /**
   * Resolves target user list, dispatches direct messages, and updates sentToCount in database.
   */
  async dispatchOperation(
    client: Client,
    operationId: string,
    issuerTag: string
  ): Promise<number> {
    const operation = await prisma.operation.findUnique({
      where: { id: operationId },
    });

    if (!operation) throw new Error('Operation not found');

    logger.info({ operationId }, 'Beginning operation DM dispatch');

    // 1. Get Egypt country ID to filter targets
    const egyptId = await this.wareraService.getEgyptCountryId();
    const userLinks = await prisma.userLink.findMany();
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: operation.guildId },
    });
    const guild = await client.guilds.fetch(operation.guildId).catch(() => null);

    const targetDiscordIds: string[] = [];

    // 2. Fetch profiles concurrently and filter based on targets
    await Promise.all(
      userLinks.map(async (link) => {
        try {
          // Fetch Discord member in the guild
          const member = guild ? await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null) : null;
          if (!member) return;

          // Check citizen & trusted role requirements
          if (config) {
            const hasCitizen = config.citizenRoleId ? member.roles.cache.has(config.citizenRoleId) : true;
            const hasTrusted = config.trustedRoleId ? member.roles.cache.has(config.trustedRoleId) : true;
            if (!hasCitizen || !hasTrusted) {
              return;
            }
          }

          const profile = await this.wareraService.getUserProfile(link.wareraUserId);
          const belongsToEgypt = profile.country === egyptId;
          if (!belongsToEgypt) return; // Only notify players in Egypt country

          const spec = this.getSpecialization(profile.skills || {});
          const level = profile.leveling?.level || 0;

          let isMatch = false;

          switch (operation.targetType) {
            case 'war':
              isMatch = spec === 'war';
              break;
            case 'economy':
              isMatch = spec === 'economy';
              break;
            case 'hybrid':
              isMatch = spec === 'hybrid';
              break;
            case 'level':
              isMatch = operation.targetLevel !== null && level >= operation.targetLevel;
              break;
            case 'mu':
              isMatch = operation.targetMuId !== null && profile.mu === operation.targetMuId;
              break;
            case 'all':
              isMatch = true;
              break;
          }

          if (isMatch) {
            targetDiscordIds.push(link.discordId);
          }
        } catch (profileError) {
          logger.warn(
            { discordId: link.discordId, error: (profileError as Error).message },
            'Failed to fetch user profile during operation target calculation'
          );
        }
      })
    );

    logger.info(
      { operationId, targetCount: targetDiscordIds.length },
      'Resolved operation target list'
    );

    if (targetDiscordIds.length === 0) {
      return 0;
    }

    // 3. Construct Buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`op_avail_${operation.id}`)
        .setLabel('Available')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`op_unavail_${operation.id}`)
        .setLabel('Unavailable')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    let successfullySent = 0;

    // 4. Dispatch DMs in batch with rate limiting delay (250ms)
    for (const discordId of targetDiscordIds) {
      try {
        const user = await client.users.fetch(discordId).catch(() => null);
        if (user) {
          await user.send({
            content: `🚨 **Egypt Military Operation**\n\n**Operation:**\n${operation.title}\n\n**Objective:**\n${operation.message}\n\n*Please join military channels immediately.*\n\n**Issued by:** ${issuerTag}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
            components: [row],
          });
          successfullySent++;
        }
      } catch (dmError) {
        logger.warn(
          { discordId, error: (dmError as Error).message },
          'Failed to dispatch operation DM to user'
        );
      }
      // Delay send to respect rate limit (4 DMs per second max)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // 5. Update sentToCount in Database
    await prisma.operation.update({
      where: { id: operation.id },
      data: { sentToCount: successfullySent },
    });

    logger.info({ operationId, successfullySent }, 'Operation DM dispatch complete');
    return successfullySent;
  }
}
