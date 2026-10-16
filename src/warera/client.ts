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
  private readonly defaultTimeoutMs: number;

  constructor(timeoutMs?: number) {
    this.baseUrl = config.wareraApiBaseUrl;
    this.apiKey = config.wareraApiKey;
    this.defaultTimeoutMs = timeoutMs ?? config.wareraApiTimeoutMs ?? 15000;
  }

  /**
   * Executes a tRPC query against the WarEra API
   */
  async request<T extends keyof Responses>(
    endpoint: T,
    payload: RequestPayload<T>,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<Responses[T]> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // tRPC GET input serialization
    const params = new URLSearchParams({
      batch: '1',
      input: JSON.stringify({ '0': payload }),
    });

    const fullUrl = `${url}?${params.toString()}`;
    const effectiveTimeout = options?.timeoutMs ?? this.defaultTimeoutMs;

    logger.debug({ endpoint, payload, timeoutMs: effectiveTimeout }, `Calling WarEra API: ${endpoint}`);

    const abortController = new AbortController();
    let isTimedOut = false;

    const timeoutHandle = setTimeout(() => {
      isTimedOut = true;
      abortController.abort();
    }, effectiveTimeout);

    // If caller provided an external signal, propagate abort
    if (options?.signal) {
      options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'authorization': this.apiKey,
          'accept': 'application/json',
        },
        signal: abortController.signal,
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
      if (isTimedOut || error?.name === 'AbortError') {
        const timeoutErr = new Error(`WarEra API request timed out after ${effectiveTimeout}ms: ${endpoint}`);
        logger.error({ endpoint, payload, timeoutMs: effectiveTimeout }, 'WarEra API request timed out');
        throw timeoutErr;
      }
      logger.error({ error: error.message, endpoint, payload }, 'Failed to execute WarEra API request');
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
