"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Mon', damage: 4000, expected: 2400 },
  { name: 'Tue', damage: 3000, expected: 1398 },
  { name: 'Wed', damage: 2000, expected: 9800 },
  { name: 'Thu', damage: 2780, expected: 3908 },
  { name: 'Fri', damage: 1890, expected: 4800 },
  { name: 'Sat', damage: 2390, expected: 3800 },
  { name: 'Sun', damage: 3490, expected: 4300 },
];

export default function DamageChart() {
  return (
    <div className="h-[300px] w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorDamage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }} />
          <Area type="monotone" dataKey="damage" stroke="#ef4444" fillOpacity={1} fill="url(#colorDamage)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
