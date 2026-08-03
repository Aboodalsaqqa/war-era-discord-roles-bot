import React from 'react';
import Link from 'next/link';

const members = [
  { id: '1', name: 'Alpha Bravo', rank: 'Captain', status: 'Active', damage: '45K' },
  { id: '2', name: 'Charlie Delta', rank: 'Lieutenant', status: 'Deployed', damage: '32K' },
  { id: '3', name: 'Echo Foxtrot', rank: 'Sergeant', status: 'Offline', damage: '18K' },
  { id: '4', name: 'Golf Hotel', rank: 'Corporal', status: 'Active', damage: '22K' },
];

export default function MemberTable() {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm text-left text-slate-300">
        <thead className="text-xs text-slate-500 uppercase bg-slate-900/50 border-b border-slate-800">
          <tr>
            <th className="px-6 py-4 font-medium">Operative</th>
            <th className="px-6 py-4 font-medium">Rank</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">Avg Damage</th>
            <th className="px-6 py-4 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
              <td className="px-6 py-4 font-medium text-white">{m.name}</td>
              <td className="px-6 py-4">{m.rank}</td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${m.status === 'Active' ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' : m.status === 'Deployed' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                  {m.status}
                </span>
              </td>
              <td className="px-6 py-4 text-slate-400">{m.damage}</td>
              <td className="px-6 py-4 text-right">
                <Link href={`/members/${m.id}`} className="text-[#06b6d4] hover:text-white transition-colors">View Profile</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
