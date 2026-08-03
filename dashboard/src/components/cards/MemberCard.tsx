import React from 'react';

interface MemberCardProps {
  name: string;
  role: string;
  avatar?: string;
  status: 'active' | 'offline' | 'deployed';
}

export default function MemberCard({ name, role, avatar, status }: MemberCardProps) {
  const statusColor = status === 'active' ? 'bg-[#10b981]' : status === 'deployed' ? 'bg-[#f59e0b]' : 'bg-slate-500';
  
  return (
    <div className="glass-card p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center space-x-4 hover:border-[#10b981]/30 transition-all cursor-pointer">
      <div className="relative">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold overflow-hidden">
          {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : name.charAt(0)}
        </div>
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${statusColor}`}></span>
      </div>
      <div>
        <h4 className="text-white font-medium">{name}</h4>
        <p className="text-xs text-slate-400">{role}</p>
      </div>
    </div>
  );
}
