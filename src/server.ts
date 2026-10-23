import * as http from 'http';
import { logger } from './utils/logger';
import { UserLinkRepository } from './repositories/userLink.repository';
import { config } from './config';

export interface ServerOptions {
  port: number;
  isReady?: () => boolean;
  userLinkRepo?: UserLinkRepository;
}

export function startHealthServer(
  portOrOptions: number | ServerOptions,
  isReadyCallback?: () => boolean
): http.Server {
  const options: ServerOptions =
    typeof portOrOptions === 'number'
      ? { port: portOrOptions, isReady: isReadyCallback }
      : portOrOptions;

  const { port, isReady } = options;
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
    // /health & /ping: returns 200 during normal startup window (<60s) or when ready.
    // If the process has been running for >60s and Discord is STILL not ready, returns 503 so PaaS/Render detects the stalled startup.
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/ping' || pathname === '/ready')) {
      const ready = isReady ? isReady() : false;
      const isReadinessRoute = pathname === '/ready';
      const isStalled = !ready && process.uptime() > 60;
      const isHealthy = isReadinessRoute ? ready : !isStalled;
      const statusCode = isHealthy ? 200 : 503;

      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(
        JSON.stringify({
          status: isHealthy ? 'ok' : (isStalled ? 'stalled' : 'degraded'),
          service: 'warera-egypt-bot',
          discordReady: ready,
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
