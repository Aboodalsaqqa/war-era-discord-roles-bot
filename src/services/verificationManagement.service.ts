import { Guild } from 'discord.js';
import { UserLink } from '@prisma/client';
import { prisma } from '../database';
import { GuildConfigRepository } from '../repositories/guildConfig.repository';
import { WarEraService } from '../warera/service';
import { UserGetUserLiteResponse } from '../types/Responses';
import { logger } from '../utils/logger';

export interface VerifiedUserData {
  link: UserLink;
  profile: UserGetUserLiteResponse | null;
  isTrusted: boolean;
}

export class VerificationManagementService {
  constructor(
    private readonly configRepo: GuildConfigRepository,
    private readonly wareraService: WarEraService
  ) {}

  public getSpecialization(profile: UserGetUserLiteResponse): string {
    const skills: any = profile.skills || {};
    
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

    if (warScore > economyScore * 1.5) return 'war';
    if (economyScore > warScore * 1.5) return 'economy';
    return 'hybrid';
  }

  public async getFilteredLinks(guild: Guild): Promise<{ trusted: UserLink[]; untrusted: UserLink[] }> {
    const allLinks = await prisma.userLink.findMany();
    const config = await this.configRepo.getByGuildId(guild.id);
    
    const trusted: UserLink[] = [];
    const untrusted: UserLink[] = [];

    // Pre-fetch all members for performance if possible, or just fetch as needed
    // guild.members.fetch() without arguments fetches all members.
    await guild.members.fetch();

    for (const link of allLinks) {
      const member = guild.members.cache.get(link.discordId);
      if (!member) continue; // User is not in this guild

      let isTrusted = true;
      if (config) {
        const hasCitizen = config.citizenRoleId ? member.roles.cache.has(config.citizenRoleId) : true;
        const hasTrustedRole = config.trustedRoleId ? member.roles.cache.has(config.trustedRoleId) : true;
        isTrusted = hasCitizen && hasTrustedRole;
      }

      if (isTrusted) {
        trusted.push(link);
      } else {
        untrusted.push(link);
      }
    }

    return { trusted, untrusted };
  }

  public async fetchPageProfiles(
    links: UserLink[], 
    isTrusted: boolean, 
    page: number, 
    limit: number
  ): Promise<VerifiedUserData[]> {
    const start = page * limit;
    const end = start + limit;
    const slice = links.slice(start, end);

    const data: VerifiedUserData[] = await Promise.all(
      slice.map(async (link) => {
        let profile = null;
        try {
          profile = await this.wareraService.getUserProfile(link.wareraUserId);
        } catch (err) {
          logger.warn(`Failed to fetch profile for ${link.wareraUserId} in verified-list`);
        }
        return { link, profile, isTrusted };
      })
    );

    return data;
  }

  public async generateCsvExport(guild: Guild): Promise<string> {
    const { trusted, untrusted } = await this.getFilteredLinks(guild);
    
    const allLinks = [
      ...trusted.map(l => ({ link: l, isTrusted: true })),
      ...untrusted.map(l => ({ link: l, isTrusted: false }))
    ];

    // CSV Header
    const rows: string[] = [
      'Discord ID,Discord Username,WarEra ID,WarEra Username,Level,MU,Specialization,Trusted Status,Verification Date,Last Sync Time'
    ];

    for (const { link, isTrusted } of allLinks) {
      const member = guild.members.cache.get(link.discordId);
      const discordUsername = member?.user.tag || 'Unknown';
      
      let profile = null;
      try {
        // Sequential fetch with small delay to avoid rate limits
        profile = await this.wareraService.getUserProfile(link.wareraUserId);
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (err) {
        logger.warn(`Failed to fetch profile for export: ${link.wareraUserId}`);
      }

      const level = profile?.leveling?.level || 0;
      const mu = profile?.mu || 'None';
      const spec = profile ? this.getSpecialization(profile) : 'Unknown';
      const trustedStr = isTrusted ? 'Trusted' : 'Untrusted';
      const verifiedAt = link.verifiedAt.toISOString();
      const updatedAt = link.updatedAt.toISOString();

      // Escape quotes and commas
      const esc = (str: string) => `"${String(str).replace(/"/g, '""')}"`;

      rows.push(
        `${link.discordId},${esc(discordUsername)},${link.wareraUserId},${esc(link.wareraUsername)},${level},${esc(mu)},${spec},${trustedStr},${verifiedAt},${updatedAt}`
      );
    }

    return rows.join('\n');
  }
}
