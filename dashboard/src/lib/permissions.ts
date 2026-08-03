import { prisma } from './db';
import { NextRequest } from 'next/server';

export type Role = 'commander' | 'officer' | 'member' | 'guest';

export async function getUserRole(discordId: string, guildId: string): Promise<Role> {
  const userLink = await (prisma as any).userLink?.findUnique({
    where: { discordId },
  });

  const guildConfig = await (prisma as any).guildConfig?.findUnique({
    where: { guildId },
  });

  if (!guildConfig) return userLink ? 'member' : 'guest';

  // In a full implementation, we'd check Discord roles via API
  // or user-provided permissions to match guildConfig.officerRoleId.
  if (userLink) return 'member';
  return 'guest';
}

export function requireRole(minimumRole: Role, handler: (req: NextRequest) => Promise<Response>) {
  const roleHierarchy: Record<Role, number> = {
    commander: 3,
    officer: 2,
    member: 1,
    guest: 0,
  };

  return async (req: NextRequest) => {
    const session = await getSession(req.cookies);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userRole = await getUserRole(session.discordId, session.guildId);
    if (roleHierarchy[userRole] < roleHierarchy[minimumRole]) {
      return new Response('Forbidden', { status: 403 });
    }

    return handler(req);
  };
}

export async function getSession(cookies: any) {
  const sessionId = cookies.get('sessionId')?.value;
  if (!sessionId) return null;

  const session = await (prisma as any).dashboardSession?.findUnique({
    where: { id: sessionId },
  });
  
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}
