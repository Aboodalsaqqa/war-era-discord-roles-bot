import SkillRadar from '@/components/charts/SkillRadar';

export default function MemberProfilePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Operative Profile</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col items-center text-center">
          <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-slate-700 mb-4 flex items-center justify-center text-4xl text-slate-500 font-bold">
            AB
          </div>
          <h3 className="text-xl font-bold text-white">Alpha Bravo</h3>
          <p className="text-[#06b6d4] font-medium mb-4">Captain</p>
          <span className="px-3 py-1 bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 rounded-full text-xs font-semibold">Active</span>
        </div>

        <div className="lg:col-span-2 glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
          <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Combat Proficiency</h3>
          <SkillRadar />
        </div>
      </div>
    </div>
  );
}
