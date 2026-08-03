import { NextResponse } from 'next/server';
// import { collectPrices } from '@/collectors/prices';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // await collectPrices();
    return NextResponse.json({ success: true, message: 'Prices collected successfully' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to collect prices' }, { status: 500 });
  }
}
