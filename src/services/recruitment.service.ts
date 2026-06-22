import { RecruitmentCampaign, UserLink } from '@prisma/client';
import { Guild } from 'discord.js';
import { prisma } from '../database';
import { WarEraService } from '../warera/service';
import { UserGetUserLiteResponse } from '../types/Responses';
import { logger } from '../utils/logger';

export interface CampaignStats {
  campaign: RecruitmentCampaign;
  eligibleCount: number;
  convertedCount: number;
  remainingCount: number;
}

export interface MuConversionReport {
  muId: string;
  muName: string;
  eligible: number;
  converted: number;
}

export interface DetailedCampaignReport extends CampaignStats {
  conversionRate: number;
  muBreakdown: MuConversionReport[];
}

export class RecruitmentService {
  constructor(private readonly wareraService: WarEraService) {}

  /**
   * Starts a new recruitment campaign (deactivates existing campaigns first)
   */
  async startCampaign(
    guildId: string,
    title: string,
    minimumLevel: number,
    createdBy: string
  ): Promise<RecruitmentCampaign> {
    logger.info({ guildId, title, minimumLevel, createdBy }, 'Starting new recruitment campaign');

    // Deactivate existing active campaigns
    await prisma.recruitmentCampaign.updateMany({
      where: { guildId, active: true },
      data: { active: false, endedAt: new Date() },
    });

    // Create new campaign
    return prisma.recruitmentCampaign.create({
      data: {
        guildId,
        title,
        minimumLevel,
        active: true,
        createdBy,
      },
    });
  }

  /**
   * Stops the active recruitment campaign
   */
  async stopCampaign(guildId: string): Promise<RecruitmentCampaign | null> {
    logger.info({ guildId }, 'Stopping active recruitment campaign');

    const activeCampaign = await this.getActiveCampaign(guildId);
    if (!activeCampaign) return null;

    return prisma.recruitmentCampaign.update({
      where: { id: activeCampaign.id },
      data: { active: false, endedAt: new Date() },
    });
  }

  /**
   * Fetches the currently active recruitment campaign
   */
  async getActiveCampaign(guildId: string): Promise<RecruitmentCampaign | null> {
    return prisma.recruitmentCampaign.findFirst({
      where: { guildId, active: true },
    });
  }

  /**
   * Sets the recruitment exemption status for a user
   */
  async setExemption(discordId: string, exempt: boolean): Promise<UserLink> {
    logger.info({ discordId, exempt }, 'Setting recruitment exemption');
    return prisma.userLink.update({
      where: { discordId },
      data: { exemptFromRecruitment: exempt },
    });
  }

  /**
   * Calculates specialization type from player skills
   */
  getSpecialization(profile: UserGetUserLiteResponse): 'war' | 'economy' | 'hybrid' {
    const skills = profile.skills || {};
    
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
   * Helper to fetch active campaign and calculate eligible profiles dynamically
   */
  private async getEligibleProfiles(guild: Guild): Promise<{
    campaign: RecruitmentCampaign;
    eligibleList: { link: UserLink; profile: UserGetUserLiteResponse }[];
  }> {
    const campaign = await this.getActiveCampaign(guild.id);
    if (!campaign) {
      throw new Error('There is no active recruitment campaign in this guild.');
    }

    const config = await prisma.guildConfig.findUnique({
      where: { guildId: guild.id },
    });

    const egyptId = await this.wareraService.getEgyptCountryId();
    const userLinks = await prisma.userLink.findMany({
      where: { exemptFromRecruitment: false },
    });

    const eligibleList: { link: UserLink; profile: UserGetUserLiteResponse }[] = [];

    // Fetch latest profiles concurrently
    await Promise.all(
      userLinks.map(async (link) => {
        try {
          // Fetch Discord member in the guild
          const member = await guild.members.fetch({ user: link.discordId, force: true }).catch(() => null);
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
          const level = profile.leveling?.level || 0;
          const belongsToEgypt = profile.country === egyptId;

          if (belongsToEgypt && level >= campaign.minimumLevel) {
            eligibleList.push({ link, profile });
          }
        } catch (error) {
          logger.warn(
            { discordId: link.discordId, error: (error as Error).message },
            'Failed to fetch user profile for campaign stats calculation'
          );
        }
      })
    );

    return { campaign, eligibleList };
  }

  /**
   * Gets stats for the active recruitment campaign
   */
  async getCampaignStats(guild: Guild): Promise<CampaignStats> {
    const { campaign, eligibleList } = await this.getEligibleProfiles(guild);

    let convertedCount = 0;
    let remainingCount = 0;

    for (const { profile } of eligibleList) {
      const spec = this.getSpecialization(profile);
      if (spec === 'war') {
        convertedCount++;
      } else {
        remainingCount++;
      }
    }

    return {
      campaign,
      eligibleCount: eligibleList.length,
      convertedCount,
      remainingCount,
    };
  }

  /**
   * Generates a detailed campaign conversion report
   */
  async getDetailedReport(guild: Guild): Promise<DetailedCampaignReport> {
    const { campaign, eligibleList } = await this.getEligibleProfiles(guild);

    let convertedCount = 0;
    let remainingCount = 0;

    // MU ID caching map to prevent repetitive API calls
    const muNameCache = new Map<string, string>();
    const muStats = new Map<string, { eligible: number; converted: number }>();

    for (const { profile } of eligibleList) {
      const spec = this.getSpecialization(profile);
      const isWar = spec === 'war';

      if (isWar) {
        convertedCount++;
      } else {
        remainingCount++;
      }

      // Group by MU ID
      const muId = profile.mu || 'none';
      const stats = muStats.get(muId) || { eligible: 0, converted: 0 };
      stats.eligible++;
      if (isWar) stats.converted++;
      muStats.set(muId, stats);
    }

    const conversionRate = eligibleList.length > 0 ? (convertedCount / eligibleList.length) * 100 : 0;

    // Fetch MU names
    const muBreakdown: MuConversionReport[] = [];
    const muIdsArray = Array.from(muStats.keys());

    await Promise.all(
      muIdsArray.map(async (muId) => {
        const stats = muStats.get(muId)!;
        let muName = 'No Military Unit';

        if (muId !== 'none') {
          try {
            if (muNameCache.has(muId)) {
              muName = muNameCache.get(muId)!;
            } else {
              const mu = await this.wareraService.getMu(muId);
              muName = mu.name;
              muNameCache.set(muId, mu.name);
            }
          } catch (err) {
            muName = `MU ID: ${muId}`;
          }
        }

        muBreakdown.push({
          muId,
          muName,
          eligible: stats.eligible,
          converted: stats.converted,
        });
      })
    );

    // Sort by converted count desc
    muBreakdown.sort((a, b) => b.converted - a.converted);

    return {
      campaign,
      eligibleCount: eligibleList.length,
      convertedCount,
      remainingCount,
      conversionRate,
      muBreakdown,
    };
  }
}
