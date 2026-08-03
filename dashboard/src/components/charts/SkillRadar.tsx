"use client";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

const data = [
  { subject: 'Infantry', A: 120, fullMark: 150 },
  { subject: 'Artillery', A: 98, fullMark: 150 },
  { subject: 'Armor', A: 86, fullMark: 150 },
  { subject: 'Air Support', A: 99, fullMark: 150 },
  { subject: 'Logistics', A: 85, fullMark: 150 },
  { subject: 'Intel', A: 65, fullMark: 150 },
];

export default function SkillRadar() {
  return (
    <div className="h-[300px] w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 150]} stroke="#334155" />
          <Radar name="Unit Average" dataKey="A" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.4} />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
