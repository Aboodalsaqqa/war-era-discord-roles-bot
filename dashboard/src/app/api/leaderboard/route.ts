import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const leaderboard = [
      { rank: 1, name: 'PlayerOne', damage: 50000, score: 9500, attendanceRate: '98%' },
      { rank: 2, name: 'PlayerTwo', damage: 45000, score: 9100, attendanceRate: '95%' },
      { rank: 3, name: 'PlayerThree', damage: 40000, score: 8800, attendanceRate: '90%' },
      { rank: 4, name: 'PlayerFour', damage: 38000, score: 8500, attendanceRate: '85%' },
      { rank: 5, name: 'PlayerFive', damage: 35000, score: 8000, attendanceRate: '80%' },
    ];
    return NextResponse.json({ success: true, data: leaderboard });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
