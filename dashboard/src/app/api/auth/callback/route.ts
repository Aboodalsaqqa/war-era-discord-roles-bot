import { NextResponse } from 'next/server';
// import { authenticateWithDiscord } from '@/lib/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=access_denied', request.url));
  }

  // Example implementation to exchange code for token and set session cookie
  // using @/lib/auth should go here.
  
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set('session', 'authenticated_session_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7 // 1 week
  });
  
  return response;
}
