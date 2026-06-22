import { MuRole } from '@prisma/client';
import { prisma } from '../database';

export class MuRoleRepository {
  async getByMuId(guildId: string, muId: string): Promise<MuRole | null> {
    return prisma.muRole.findUnique({
      where: {
        guildId_muId: {
          guildId,
          muId,
        },
      },
    });
  }

  async listByGuild(guildId: string): Promise<MuRole[]> {
    return prisma.muRole.findMany({
      where: { guildId },
      orderBy: { muName: 'asc' },
    });
  }

  async upsertMuRole(
    guildId: string,
    muId: string,
    muName: string,
    discordRoleId: string
  ): Promise<MuRole> {
    return prisma.muRole.upsert({
      where: {
        guildId_muId: {
          guildId,
          muId,
        },
      },
      update: {
        muName,
        discordRoleId,
      },
      create: {
        guildId,
        muId,
        muName,
        discordRoleId,
      },
    });
  }

  async deleteMuRole(guildId: string, muId: string): Promise<MuRole | null> {
    return prisma.muRole.delete({
      where: {
        guildId_muId: {
          guildId,
          muId,
        },
      },
    }).catch(() => null);
  }
}
