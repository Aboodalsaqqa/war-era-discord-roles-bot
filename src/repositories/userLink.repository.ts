import { UserLink } from '@prisma/client';
import { prisma } from '../database';

export class UserLinkRepository {
  async getByDiscordId(discordId: string): Promise<UserLink | null> {
    return prisma.userLink.findUnique({
      where: { discordId },
    });
  }

  async getByWarEraUserId(wareraUserId: string): Promise<UserLink | null> {
    return prisma.userLink.findUnique({
      where: { wareraUserId },
    });
  }

  async upsertUserLink(
    discordId: string,
    wareraUserId: string,
    wareraUsername: string
  ): Promise<UserLink> {
    return prisma.userLink.upsert({
      where: { discordId },
      update: {
        wareraUserId,
        wareraUsername,
        verifiedAt: new Date(),
      },
      create: {
        discordId,
        wareraUserId,
        wareraUsername,
        verifiedAt: new Date(),
      },
    });
  }

  async deleteUserLink(discordId: string): Promise<UserLink | null> {
    return prisma.userLink.delete({
      where: { discordId },
    }).catch(() => null);
  }

  async listAll(): Promise<UserLink[]> {
    return prisma.userLink.findMany();
  }
}
