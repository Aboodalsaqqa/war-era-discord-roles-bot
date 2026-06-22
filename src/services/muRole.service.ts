import { MuRole } from '@prisma/client';
import { MuRoleRepository } from '../repositories/muRole.repository';
import { WarEraService } from '../warera/service';
import { logger } from '../utils/logger';

export class MuRoleService {
  constructor(
    private readonly repository: MuRoleRepository,
    private readonly wareraService: WarEraService
  ) {}

  async listMuRoles(guildId: string): Promise<MuRole[]> {
    return this.repository.listByGuild(guildId);
  }

  async addMuRole(
    guildId: string,
    muId: string,
    discordRoleId: string
  ): Promise<MuRole> {
    try {
      logger.info({ guildId, muId, discordRoleId }, 'Adding MU role mapping');
      
      // Fetch MU from WarEra API to validate and get name
      const mu = await this.wareraService.getMu(muId);
      
      return await this.repository.upsertMuRole(
        guildId,
        muId,
        mu.name,
        discordRoleId
      );
    } catch (error) {
      logger.error({ error: (error as Error).message, guildId, muId }, 'Failed to add MU role mapping');
      throw error;
    }
  }

  async removeMuRole(guildId: string, muId: string): Promise<MuRole | null> {
    logger.info({ guildId, muId }, 'Removing MU role mapping');
    return this.repository.deleteMuRole(guildId, muId);
  }
}
