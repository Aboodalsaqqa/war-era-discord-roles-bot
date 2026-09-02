import * as http from 'http';
import { logger } from './utils/logger';

export function startHealthServer(port: number, isReady?: () => boolean): http.Server {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';

    if (req.method === 'GET' && (url === '/' || url === '/health' || url === '/ping')) {
      const ready = isReady ? isReady() : true;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'warera-egypt-bot',
          discordReady: ready,
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port, host: '0.0.0.0' }, `HTTP health check server listening on 0.0.0.0:${port}`);
  });

  server.on('error', (err: Error) => {
    logger.error({ error: err.message, port }, 'HTTP health check server error');
  });

  return server;
}
