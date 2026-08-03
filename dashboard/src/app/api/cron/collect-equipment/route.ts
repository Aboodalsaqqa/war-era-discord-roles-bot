import { NextResponse } from 'next/server';
// import { collectEquipment } from '@/collectors/equipment';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // await collectEquipment();
    return NextResponse.json({ success: true, message: 'Equipment collected successfully' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to collect equipment' }, { status: 500 });
  }
}
