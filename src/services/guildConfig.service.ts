import { GuildConfig } from '@prisma/client';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';

export class GuildConfigService {
  constructor(private readonly repository: GuildConfigRepository) {}

  async getConfig(guildId: string): Promise<GuildConfig | null> {
    return this.repository.getByGuildId(guildId);
  }

  async updateConfig(
    guildId: string,
    data: Partial<Omit<GuildConfig, 'id' | 'guildId' | 'updatedAt'>>
  ): Promise<GuildConfig> {
    return this.repository.upsertConfig(guildId, data);
  }
}
