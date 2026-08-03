import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface StatCardProps {
  title: string;
  value: string | number;
  trend?: number;
  icon?: React.ReactNode;
  className?: string;
}

export default function StatCard({ title, value, trend, icon, className }: StatCardProps) {
  return (
    <div className={twMerge("glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40 relative overflow-hidden group", className)}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-[#10b981]/10"></div>
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</h3>
        {icon && <div className="text-slate-500">{icon}</div>}
      </div>
      <div className="relative z-10 flex items-baseline space-x-3">
        <h2 className="text-3xl font-bold text-white">{value}</h2>
        {trend !== undefined && (
          <span className={clsx("text-sm font-semibold", trend >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
    </div>
  );
}
