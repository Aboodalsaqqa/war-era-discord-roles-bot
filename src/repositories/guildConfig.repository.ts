import { GuildConfig } from '@prisma/client';
import { prisma } from '../database';

export class GuildConfigRepository {
  async getByGuildId(guildId: string): Promise<GuildConfig | null> {
    return prisma.guildConfig.findUnique({
      where: { guildId },
    });
  }

  async upsertConfig(
    guildId: string,
    data: Partial<Omit<GuildConfig, 'id' | 'guildId' | 'updatedAt'>>
  ): Promise<GuildConfig> {
    return prisma.guildConfig.upsert({
      where: { guildId },
      update: data,
      create: {
        guildId,
        ...data,
      },
    });
  }

  async deleteConfig(guildId: string): Promise<GuildConfig | null> {
    return prisma.guildConfig.delete({
      where: { guildId },
    }).catch(() => null);
  }
}
