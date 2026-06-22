import { UserLink } from '@prisma/client';
import { UserLinkRepository } from '../repositories/userLink.repository';
import { WarEraService } from '../warera/service';
import { UserGetUserLiteResponse } from '../types/Responses';
import { logger } from '../utils/logger';

export type VerificationResult =
  | { status: 'success'; profile: UserGetUserLiteResponse; userLink: UserLink }
  | { status: 'multiple'; profiles: UserGetUserLiteResponse[] }
  | { status: 'not_found' };

export class VerificationService {
  constructor(
    private readonly repository: UserLinkRepository,
    private readonly wareraService: WarEraService
  ) {}

  /**
   * Starts the verification flow for a user by searching their username
   */
  async startVerification(
    discordId: string,
    username: string
  ): Promise<VerificationResult> {
    logger.info({ discordId, username }, 'Starting user verification flow');

    try {
      // 1. Search player in WarEra API
      const profiles = await this.wareraService.searchPlayers(username);

      if (profiles.length === 0) {
        logger.info({ discordId, username }, 'Verification: no players found');
        return { status: 'not_found' };
      }

      // If search returns multiple profiles, filter for exact matches (case-insensitive)
      // to see if we can resolve it immediately.
      const exactMatches = profiles.filter(
        (p) => p.username.toLowerCase() === username.toLowerCase()
      );

      if (exactMatches.length === 1) {
        const profile = exactMatches[0];
        const userLink = await this.linkAccount(discordId, profile._id, profile.username);
        return { status: 'success', profile, userLink };
      }

      // If we have exactly one profile returned overall, treat it as the target
      if (profiles.length === 1) {
        const profile = profiles[0];
        const userLink = await this.linkAccount(discordId, profile._id, profile.username);
        return { status: 'success', profile, userLink };
      }

      // Otherwise, return multiple matches to display a Discord Select Menu
      logger.info({ discordId, username, count: profiles.length }, 'Verification: multiple players found');
      return { status: 'multiple', profiles };
    } catch (error) {
      logger.error({ error: (error as Error).message, discordId, username }, 'Failed verification flow');
      throw error;
    }
  }

  /**
   * Links a Discord account to a WarEra account ID and username
   */
  async linkAccount(
    discordId: string,
    wareraUserId: string,
    wareraUsername: string
  ): Promise<UserLink> {
    logger.info({ discordId, wareraUserId, wareraUsername }, 'Linking Discord account to WarEra profile');
    return this.repository.upsertUserLink(discordId, wareraUserId, wareraUsername);
  }

  /**
   * Unlinks a Discord account
   */
  async unlinkAccount(discordId: string): Promise<UserLink | null> {
    logger.info({ discordId }, 'Unlinking Discord account');
    return this.repository.deleteUserLink(discordId);
  }

  /**
   * Retrieves link details for a Discord ID
   */
  async getLinkByDiscordId(discordId: string): Promise<UserLink | null> {
    return this.repository.getByDiscordId(discordId);
  }

  /**
   * Retrieves link details for a WarEra User ID
   */
  async getLinkByWarEraUserId(wareraUserId: string): Promise<UserLink | null> {
    return this.repository.getByWarEraUserId(wareraUserId);
  }
}
