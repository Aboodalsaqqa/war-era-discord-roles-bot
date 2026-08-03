import StatCard from '@/components/cards/StatCard';
import ReadinessCard from '@/components/cards/ReadinessCard';
import MemberCard from '@/components/cards/MemberCard';
import DamageChart from '@/components/charts/DamageChart';
import { Crosshair, Users, Activity } from 'lucide-react';

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Command Center</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Force" value="142" trend={5} icon={<Users className="w-5 h-5" />} />
        <StatCard title="Active Deployed" value="89" trend={-2} icon={<Activity className="w-5 h-5" />} />
        <StatCard title="Total Damage (Weekly)" value="1.2M" trend={12} icon={<Crosshair className="w-5 h-5" />} />
        <ReadinessCard percentage={92} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
          <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Damage Output Trends</h3>
          <DamageChart />
        </div>
        
        <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
          <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Active Operatives</h3>
          <div className="space-y-4">
            <MemberCard name="Alpha Bravo" role="Assault Lead" status="active" />
            <MemberCard name="Charlie Delta" role="Recon" status="deployed" />
            <MemberCard name="Echo Foxtrot" role="Support" status="offline" />
            <MemberCard name="Golf Hotel" role="Sniper" status="active" />
          </div>
        </div>
      </div>
    </div>
  );
}
