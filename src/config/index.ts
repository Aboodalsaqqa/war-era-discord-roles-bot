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
};
