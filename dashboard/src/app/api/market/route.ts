import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const marketData = {
      latestPrices: [
        { item: 'Gold', price: 100, trend: 'up' },
        { item: 'Wood', price: 50, trend: 'down' },
        { item: 'Stone', price: 75, trend: 'stable' }
      ],
      history: [
        { date: '2023-10-01', items: { Gold: 90, Wood: 55, Stone: 75 } },
        { date: '2023-10-08', items: { Gold: 95, Wood: 52, Stone: 75 } },
        { date: '2023-10-15', items: { Gold: 100, Wood: 50, Stone: 75 } }
      ]
    };
    return NextResponse.json({ success: true, data: marketData });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch market data' }, { status: 500 });
  }
}
