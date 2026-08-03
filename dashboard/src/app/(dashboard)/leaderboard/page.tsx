import MemberTable from '@/components/tables/MemberTable';

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Global Leaderboard</h2>
      <div className="glass-card rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <MemberTable />
      </div>
    </div>
  );
}
