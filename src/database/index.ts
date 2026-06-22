import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('query', (e) => {
  logger.debug({ query: e.query, params: e.params, duration: `${e.duration}ms` }, 'Prisma Query');
});

prisma.$on('info', (e) => {
  logger.info({ message: e.message }, 'Prisma Info');
});

prisma.$on('warn', (e) => {
  logger.warn({ message: e.message }, 'Prisma Warning');
});

prisma.$on('error', (e) => {
  logger.error({ message: e.message }, 'Prisma Error');
});
