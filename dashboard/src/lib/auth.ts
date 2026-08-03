import { prisma } from './db';

export const DISCORD_OAUTH_URL = 'https://discord.com/api/oauth2/authorize';
export const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
export const DISCORD_API_URL = 'https://discord.com/api/v10';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/callback`;

export function getDiscordAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
  });
  return `${DISCORD_OAUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error('Failed to exchange code');
  }

  return res.json();
}

export async function getDiscordUser(accessToken: string) {
  const res = await fetch(`${DISCORD_API_URL}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch Discord user');
  }

  return res.json();
}

export async function createSession(discordUser: any, guildId: string = '') {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  const session = await (prisma as any).dashboardSession?.create({
    data: {
      discordId: discordUser.id,
      guildId,
      expiresAt,
    },
  });

  return session;
}
