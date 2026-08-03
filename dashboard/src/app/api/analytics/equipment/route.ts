import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const equipmentData = {
      tierDistribution: {
        'Tier 1': 10,
        'Tier 2': 25,
        'Tier 3': 30,
        'Tier 4': 15,
        'Tier 5': 5
      }
    };
    return NextResponse.json({ success: true, data: equipmentData });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch equipment analytics' }, { status: 500 });
  }
}
