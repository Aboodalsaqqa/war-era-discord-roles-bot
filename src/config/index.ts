import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface Config {
  discordToken: string;
  discordClientId: string;
  databaseUrl: string;
  wareraApiKey: string;
  wareraApiBaseUrl: string;
  port: number;
  internalApiKey?: string;
  wareraApiTimeoutMs: number;
}

const getEnvOrThrow = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const config: Config = {
  discordToken: getEnvOrThrow('DISCORD_TOKEN'),
  discordClientId: getEnvOrThrow('DISCORD_CLIENT_ID'),
  databaseUrl: getEnvOrThrow('DATABASE_URL'),
  wareraApiKey: getEnvOrThrow('WARERA_API_KEY'),
  wareraApiBaseUrl: process.env.WARERA_API_BASE_URL || 'https://api2.warera.io/trpc/',
  port: parseInt(process.env.PORT || '10000', 10),
  internalApiKey: process.env.INTERNAL_API_KEY || process.env.API_SECRET_KEY,
  wareraApiTimeoutMs: parseInt(process.env.WARERA_API_TIMEOUT_MS || '15000', 10),
};
