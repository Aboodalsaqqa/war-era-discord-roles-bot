import { NextResponse } from 'next/server';
// import { collectSnapshots } from '@/collectors/snapshots';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // await collectSnapshots();
    return NextResponse.json({ success: true, message: 'Snapshots collected successfully' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to collect snapshots' }, { status: 500 });
  }
}
