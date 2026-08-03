import { apiCache } from './cache';
import { MAX_API_REQUESTS_PER_MINUTE, CACHE_TTL_MS } from './constants';

const API_BASE_URL = process.env.WARERA_API_BASE_URL || 'https://api.warera.com';
const API_KEY = process.env.WARERA_API_KEY || '';

interface QueueItem {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  execute: () => Promise<any>;
}

class WarEraApiClient {
  private requestQueue: QueueItem[] = [];
  private processing: boolean = false;
  private requestsThisMinute: number = 0;
  private currentMinute: number = Math.floor(Date.now() / 60000);

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.requestQueue.length > 0) {
      const nowMinute = Math.floor(Date.now() / 60000);
      if (nowMinute !== this.currentMinute) {
        this.currentMinute = nowMinute;
        this.requestsThisMinute = 0;
      }

      if (this.requestsThisMinute >= MAX_API_REQUESTS_PER_MINUTE) {
        const delay = 60000 - (Date.now() % 60000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const item = this.requestQueue.shift();
      if (!item) break;

      this.requestsThisMinute++;
      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }
    this.processing = false;
  }

  private async enqueueRequest<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, execute });
      this.processQueue();
    });
  }

  private async fetchBatched<T>(endpoint: string, payload: any): Promise<T> {
    const cacheKey = `${endpoint}-${JSON.stringify(payload)}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached as T;

    const execute = async () => {
      const query = new URLSearchParams({
        batch: '1',
        input: JSON.stringify({ "0": payload }),
      });
      const url = `${API_BASE_URL}/${endpoint}?${query.toString()}`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      const result = data[0]?.result?.data;
      apiCache.set(cacheKey, result, CACHE_TTL_MS);
      return result;
    };

    return this.enqueueRequest(execute);
  }

  async getUserProfile(userId: string) {
    return this.fetchBatched('user.getProfile', { userId });
  }

  async searchPlayers(query: string) {
    return this.fetchBatched('user.search', { query });
  }

  async getAllCountries() {
    return this.fetchBatched('country.getAll', {});
  }

  async getGovernment(countryId: string) {
    return this.fetchBatched('country.getGovernment', { countryId });
  }

  async getMu(muId: string) {
    return this.fetchBatched('mu.get', { muId });
  }

  async getCurrentEquipment(userId: string) {
    return this.fetchBatched('equipment.getCurrent', { userId });
  }

  async getMarketPrices() {
    return this.fetchBatched('market.getPrices', {});
  }

  async getBattles() {
    return this.fetchBatched('battle.getActive', {});
  }

  async getRanking(type: string) {
    return this.fetchBatched('ranking.get', { type });
  }
}

export const wareraApi = new WarEraApiClient();
