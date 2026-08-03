import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const attendanceData = {
      rate: '85%',
      history: [
        { event: 'War A', attendees: 40, total: 50, date: '2023-10-01' },
        { event: 'War B', attendees: 45, total: 50, date: '2023-10-08' },
        { event: 'War C', attendees: 42, total: 50, date: '2023-10-15' },
      ]
    };
    return NextResponse.json({ success: true, data: attendanceData });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch attendance analytics' }, { status: 500 });
  }
}
