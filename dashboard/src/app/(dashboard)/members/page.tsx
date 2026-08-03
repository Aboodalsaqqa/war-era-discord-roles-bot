import MemberTable from '@/components/tables/MemberTable';

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Roster Management</h2>
        <button className="px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-[#10b981]/20">
          Add Operative
        </button>
      </div>

      <div className="glass-card rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <MemberTable />
      </div>
    </div>
  );
}
