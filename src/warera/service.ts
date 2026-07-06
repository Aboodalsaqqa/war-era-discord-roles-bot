import { WarEraClient } from './client';
import {
  UserGetUserLiteResponse,
  CountryListItem,
  GovernmentGetByCountryIdResponse,
  MuGetByIdResponse,
  MuListItem,
  MuGetManyPaginatedResponse,
  RankingItem,
} from '../types/Responses';
import { logger } from '../utils/logger';

export class WarEraService {
  private readonly client: WarEraClient;
  private egyptCountryId: string | null = null;
  private countryCache: CountryListItem[] | null = null;
  private countryCacheTimestamp: number = 0;
  
  private rankingCaches: Record<string, { items: RankingItem[]; timestamp: number }> = {};

  constructor(client: WarEraClient) {
    this.client = client;
  }

  /**
   * Retrieves a user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserGetUserLiteResponse> {
    return this.client.request('user.getUserLite', { userId });
  }

  /**
   * Search for players by username and fetch their complete profiles
   */
  async searchPlayers(username: string): Promise<UserGetUserLiteResponse[]> {
    logger.info({ username }, `Searching for players on WarEra`);
    try {
      const searchRes = await this.client.request('search.searchAnything', {
        searchText: username,
      });

      const userIds = searchRes.userIds || [];
      if (userIds.length === 0) {
        return [];
      }

      // Fetch profiles for matches (limited to top 10 for performance)
      const profiles = await Promise.all(
        userIds.slice(0, 10).map(async (id) => {
          try {
            return await this.getUserProfile(id);
          } catch (error) {
            logger.warn({ id, error: (error as Error).message }, 'Failed to fetch search result user profile');
            return null;
          }
        })
      );

      return profiles.filter((p): p is UserGetUserLiteResponse => p !== null);
    } catch (error) {
      logger.error({ error: (error as Error).message, username }, 'Failed searchPlayers');
      throw error;
    }
  }

  /**
   * Fetches all countries from the API
   */
  async getAllCountries(): Promise<CountryListItem[]> {
    return this.client.request('country.getAllCountries', {});
  }

  /**
   * Finds the country ID for Egypt
   */
  async getEgyptCountryId(): Promise<string> {
    if (this.egyptCountryId) {
      return this.egyptCountryId;
    }

    const countries = await this.getAllCountries();
    const egypt = countries.find(
      (c) => c.name.toLowerCase() === 'egypt' || c.code.toLowerCase() === 'eg'
    );

    if (!egypt) {
      logger.error('Egypt country profile not found in WarEra countries list');
      throw new Error('Egypt country profile not found on WarEra');
    }

    this.egyptCountryId = egypt._id;
    return this.egyptCountryId;
  }

  /**
   * Retrieves government members for a country by country ID
   */
  async getGovernment(countryId: string): Promise<GovernmentGetByCountryIdResponse> {
    return this.client.request('government.getByCountryId', { countryId });
  }

  /**
   * Retrieves details for a specific Military Unit
   */
  async getMu(muId: string): Promise<MuGetByIdResponse> {
    return this.client.request('mu.getById', { muId });
  }

  /**
   * Fetches all Military Units globally and filters them by Egypt country ID
   */
  async getAllEgyptMus(): Promise<MuListItem[]> {
    const egyptId = await this.getEgyptCountryId();
    let allMus: MuListItem[] = [];
    let nextCursor: string | undefined = undefined;

    logger.info('Fetching all MUs from WarEra API to filter for Egypt...');

    while (true) {
      const response: MuGetManyPaginatedResponse = await this.client.request('mu.getManyPaginated', {
        limit: 100,
        cursor: nextCursor,
      });

      if (response.items && response.items.length > 0) {
        allMus = allMus.concat(response.items);
      }

      if (response.nextCursor) {
        nextCursor = response.nextCursor;
      } else {
        break;
      }
    }

    const egyptMus = allMus.filter((mu) => mu.country === egyptId);
    logger.info({ totalGlobal: allMus.length, totalEgypt: egyptMus.length }, 'Completed fetching Egypt MUs');
    
    return egyptMus;
  }

  /**
   * Fetches all Military Units owned by a specific user
   */
  async getOwnedMus(userId: string): Promise<MuListItem[]> {
    let allMus: MuListItem[] = [];
    let nextCursor: string | undefined = undefined;

    while (true) {
      const response: MuGetManyPaginatedResponse = await this.client.request('mu.getManyPaginated', {
        userId,
        limit: 100,
        cursor: nextCursor,
      });

      if (response.items && response.items.length > 0) {
        allMus = allMus.concat(response.items);
      }

      if (response.nextCursor) {
        nextCursor = response.nextCursor;
      } else {
        break;
      }
    }
    
    return allMus;
  }

  /**
   * Calculates the Egypt-specific ranking for a user using a 5-minute memory cache
   */
  async getEgyptUserRank(userId: string, rankingType: 'userDamages' | 'weeklyUserDamages'): Promise<number | null> {
    const egyptId = await this.getEgyptCountryId();
    const cacheKey = rankingType;
    const cacheDuration = 5 * 60 * 1000; // 5 minutes

    let items: RankingItem[] = [];

    if (this.rankingCaches[cacheKey] && Date.now() - this.rankingCaches[cacheKey].timestamp < cacheDuration) {
      items = this.rankingCaches[cacheKey].items;
    } else {
      logger.info(`Fetching fresh global ranking from WarEra API for ${rankingType}...`);
      const response = await this.client.request('ranking.getRanking', { rankingType });
      if (response && response.items) {
        items = response.items;
        this.rankingCaches[cacheKey] = { items, timestamp: Date.now() };
      }
    }

    if (items.length === 0) return null;

    // Filter strictly to Egypt players
    const egyptRankings = items.filter(r => r.country === egyptId);
    
    // Sort descending by value to ensure accurate ranking
    egyptRankings.sort((a, b) => b.value - a.value);

    // Find the user's position
    const rankIndex = egyptRankings.findIndex(r => r.user === userId);
    
    if (rankIndex === -1) return null;
    return rankIndex + 1;
  }
}
