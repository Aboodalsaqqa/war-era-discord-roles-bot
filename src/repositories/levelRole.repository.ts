import { LevelRole } from '@prisma/client';
import { prisma } from '../database';

export class LevelRoleRepository {
  async getByMinimumLevel(guildId: string, minimumLevel: number): Promise<LevelRole | null> {
    return prisma.levelRole.findUnique({
      where: {
        guildId_minimumLevel: {
          guildId,
          minimumLevel,
        },
      },
    });
  }

  async listByGuild(guildId: string): Promise<LevelRole[]> {
    return prisma.levelRole.findMany({
      where: { guildId },
      orderBy: { minimumLevel: 'asc' },
    });
  }

  async upsertLevelRole(
    guildId: string,
    minimumLevel: number,
    discordRoleId: string
  ): Promise<LevelRole> {
    return prisma.levelRole.upsert({
      where: {
        guildId_minimumLevel: {
          guildId,
          minimumLevel,
        },
      },
      update: {
        discordRoleId,
      },
      create: {
        guildId,
        minimumLevel,
        discordRoleId,
      },
    });
  }

  async deleteLevelRole(guildId: string, minimumLevel: number): Promise<LevelRole | null> {
    return prisma.levelRole.delete({
      where: {
        guildId_minimumLevel: {
          guildId,
          minimumLevel,
        },
      },
    }).catch(() => null);
  }
}
