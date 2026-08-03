import { NextResponse } from 'next/server';
// import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Mock db call for full profile including snapshots, equipment, attendance
    const profile = {
      id,
      discordId: '123456789',
      gameId: 'PlayerOne',
      snapshots: [
        { date: '2023-10-01', power: 14500, level: 41 },
        { date: '2023-10-15', power: 15000, level: 42 },
      ],
      equipment: [
        { type: 'Weapon', tier: 'T4', status: 'Equipped' },
        { type: 'Armor', tier: 'T3', status: 'Equipped' },
      ],
      attendance: [
        { eventId: 'war-1', attended: true, date: '2023-10-10' },
        { eventId: 'war-2', attended: true, date: '2023-10-12' },
      ]
    };

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch member profile' }, { status: 500 });
  }
}
