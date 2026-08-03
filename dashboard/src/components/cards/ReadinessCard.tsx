import React from 'react';

export default function ReadinessCard({ percentage = 85 }: { percentage?: number }) {
  const color = percentage > 80 ? 'text-[#10b981]' : percentage > 50 ? 'text-[#f59e0b]' : 'text-[#ef4444]';
  const barColor = percentage > 80 ? 'bg-[#10b981]' : percentage > 50 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]';

  return (
    <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">Combat Readiness</h3>
      <div className="flex items-end justify-between mb-2">
        <span className={`text-2xl font-bold ${color}`}>{percentage}%</span>
        <span className="text-xs text-slate-500">System Operational</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
}
