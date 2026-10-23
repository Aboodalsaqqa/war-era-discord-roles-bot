import * as http from 'http';
import { logger } from './utils/logger';
import { UserLinkRepository } from './repositories/userLink.repository';
import { config } from './config';
import { RateLimitMetadata } from './discord/rateLimitTracker';

export interface ServerOptions {
  port: number;
  isReady?: () => boolean;
  userLinkRepo?: UserLinkRepository;
  getRateLimitState?: () => RateLimitMetadata;
}

export function startHealthServer(
  portOrOptions: number | ServerOptions,
  isReadyCallback?: () => boolean,
  getRateLimitStateCallback?: () => RateLimitMetadata
): http.Server {
  const options: ServerOptions =
    typeof portOrOptions === 'number'
      ? { port: portOrOptions, isReady: isReadyCallback, getRateLimitState: getRateLimitStateCallback }
      : portOrOptions;

  const { port, isReady, getRateLimitState } = options;
  const userLinkRepo = options.userLinkRepo || new UserLinkRepository();

  const server = http.createServer(async (req, res) => {
    // Set standard CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = req.url || '/';
    let pathname = reqUrl;
    let queryParams: URLSearchParams | null = null;

    try {
      const parsed = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
      pathname = parsed.pathname;
      queryParams = parsed.searchParams;
    } catch {
      pathname = reqUrl.split('?')[0];
    }

    // 1. Health & Ping check (public, no authentication required)
    // /ready endpoint: returns 200 only when Discord is actively ready, 503 otherwise.
    // /health & /ping: returns 200 during startup window, during legitimate Discord rate-limit backoff, or when ready.
    // If stalled without active rate limit for >90s, returns 503 so PaaS detects frozen processes.
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/ping' || pathname === '/ready')) {
      const ready = isReady ? isReady() : false;
      const rlState = getRateLimitState ? getRateLimitState() : null;
      const isRateLimited = rlState?.isRateLimited ?? false;
      const isReadinessRoute = pathname === '/ready';

      const isStalled = !ready && !isRateLimited && process.uptime() > 90;
      const isHealthy = isReadinessRoute ? ready : !isStalled;
      const statusCode = isHealthy ? 200 : 503;

      let statusDescription = 'ok';
      if (isRateLimited) {
        statusDescription = 'rate_limited';
      } else if (isStalled) {
        statusDescription = 'stalled';
      }

      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(
        JSON.stringify({
          status: statusDescription,
          service: 'warera-egypt-bot',
          discordReady: ready,
          rateLimit: isRateLimited
            ? {
                active: true,
                scope: rlState?.lastScope,
                isGlobal: rlState?.isGlobal,
                remainingCooldownSeconds: Math.ceil(
                  (rlState?.activeUntil ? Math.max(0, rlState.activeUntil - Date.now()) : 0) / 1000
                ),
                path: rlState?.lastPath,
              }
            : undefined,
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 2. Read-only API: GET /api/v1/players/discord/:discordId
    const playerMatch = pathname.match(/^\/api\/v1\/players\/discord\/([a-zA-Z0-9_-]+)\/?$/);
    if (req.method === 'GET' && playerMatch) {
      // Optional security: Validate API key if INTERNAL_API_KEY is configured
      if (config.internalApiKey) {
        const authHeader = req.headers['authorization'];
        const apiKeyHeader = req.headers['x-api-key'];
        const queryApiKey = queryParams?.get('apiKey');

        let providedKey: string | undefined;
        if (typeof apiKeyHeader === 'string') {
          providedKey = apiKeyHeader;
        } else if (authHeader && authHeader.startsWith('Bearer ')) {
          providedKey = authHeader.slice(7).trim();
        } else if (queryApiKey) {
          providedKey = queryApiKey;
        }

        if (!providedKey || providedKey !== config.internalApiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }));
          return;
        }
      }

      const rawDiscordId = playerMatch[1];
      const discordId = decodeURIComponent(rawDiscordId).trim();

      try {
        // Pure direct database lookup: Discord ID -> linked WarEra Player ID.
        // Performs an unconditional query on existing UserLink data.
        // Does NOT check verification status, Citizen role, country, guild membership, or any eligibility condition.
        const link = await userLinkRepo.getByDiscordId(discordId);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(
          JSON.stringify({
            warEraUserId: link ? link.wareraUserId : null,
          })
        );
      } catch (err) {
        logger.error({ discordId, error: (err as Error).message }, 'Failed to lookup player link');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to lookup player link' }));
      }
      return;
    }

    // 3. Fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port, host: '0.0.0.0' }, `HTTP server listening on 0.0.0.0:${port}`);
  });

  server.on('error', (err: Error) => {
    logger.error({ error: err.message, port }, 'HTTP server error');
  });

  return server;
}
