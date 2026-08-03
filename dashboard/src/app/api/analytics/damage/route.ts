import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const aggregatedDamageData = {
      totalDamage: 5000000,
      history: [
        { date: '2023-10-01', damage: 100000 },
        { date: '2023-10-05', damage: 150000 },
        { date: '2023-10-10', damage: 250000 },
        { date: '2023-10-15', damage: 400000 },
      ]
    };
    return NextResponse.json({ success: true, data: aggregatedDamageData });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch damage analytics' }, { status: 500 });
  }
}
