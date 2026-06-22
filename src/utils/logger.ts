import pino from 'pino';

// Default to production logging (raw JSON) if deployed on Render or Railway,
// regardless of what NODE_ENV is explicitly set to in the dashboard.
const isProductionEnvironment = 
  process.env.NODE_ENV === 'production' || 
  process.env.RENDER === 'true' || 
  !!process.env.RAILWAY_ENVIRONMENT;

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...( !isProductionEnvironment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }
    : {}
  )
});
