import { paths } from '../types/warera-openapi';
import { Responses } from '../types/Responses';
import { config } from '../config';
import { logger } from '../utils/logger';

type PathKey<T extends string> = `/${T}`;

export type RequestPayload<T extends keyof Responses> = PathKey<T> extends keyof paths
  ? paths[PathKey<T>]['post'] extends { requestBody?: { content: { 'application/json': infer P } } }
    ? P
    : Record<string, never>
  : Record<string, never>;

export class WarEraClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = config.wareraApiBaseUrl;
    this.apiKey = config.wareraApiKey;
  }

  /**
   * Executes a tRPC query against the WarEra API
   */
  async request<T extends keyof Responses>(
    endpoint: T,
    payload: RequestPayload<T>
  ): Promise<Responses[T]> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // tRPC GET input serialization
    const params = new URLSearchParams({
      batch: '1',
      input: JSON.stringify({ '0': payload }),
    });

    const fullUrl = `${url}?${params.toString()}`;

    logger.debug({ endpoint, payload }, `Calling WarEra API: ${endpoint}`);

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'authorization': this.apiKey,
          'accept': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        logger.error(
          { status: response.status, statusText: response.statusText, response: text, endpoint },
          'WarEra API HTTP failure'
        );
        throw new Error(`WarEra API HTTP error: ${response.status} ${response.statusText}`);
      }

      const resList = await response.json();

      if (!Array.isArray(resList) || resList.length === 0) {
        logger.error({ response: resList, endpoint }, 'Invalid response shape from WarEra API (expected array)');
        throw new Error('Invalid response shape from WarEra API (expected array)');
      }

      const firstItem = resList[0];

      // Handle tRPC errors
      if (firstItem.error) {
        const trpcError = firstItem.error.json || firstItem.error;
        logger.error({ error: trpcError, endpoint, payload }, 'WarEra API returned tRPC error');
        throw new Error(`WarEra API Error: ${trpcError.message || 'Unknown error'}`);
      }

      const result = firstItem.result;
      if (!result || !result.data) {
        logger.error({ response: firstItem, endpoint }, 'Missing result or data in WarEra API response');
        throw new Error('Missing result or data in WarEra API response');
      }

      const data = result.data.json !== undefined ? result.data.json : result.data;
      return data as Responses[T];
    } catch (error: any) {
      logger.error({ error: error.message, endpoint, payload }, 'Failed to execute WarEra API request');
      throw error;
    }
  }
}
