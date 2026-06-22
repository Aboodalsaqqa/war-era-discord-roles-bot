import { WarEraClient } from './client';
import {
  UserGetUserLiteResponse,
  CountryListItem,
  GovernmentGetByCountryIdResponse,
  MuGetByIdResponse,
} from '../types/Responses';
import { logger } from '../utils/logger';

export class WarEraService {
  private readonly client: WarEraClient;
  private egyptCountryId: string | null = null;

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
}
