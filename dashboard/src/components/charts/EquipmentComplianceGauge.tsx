"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const data = [
  { name: 'Compliant', value: 400 },
  { name: 'Non-Compliant', value: 50 },
  { name: 'Pending Review', value: 100 },
];

const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

export default function EquipmentComplianceGauge() {
  return (
    <div className="h-[250px] w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center space-x-4 mt-2">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
            <span className="text-slate-400">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
