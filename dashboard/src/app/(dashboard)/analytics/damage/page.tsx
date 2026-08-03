import DamageChart from '@/components/charts/DamageChart';
import StatCard from '@/components/cards/StatCard';
import { Crosshair } from 'lucide-react';

export default function DamageAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Damage Analytics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Daily Avg" value="28.4K" trend={4.2} icon={<Crosshair className="w-5 h-5" />} />
        <StatCard title="Weekly Total" value="1.2M" trend={12} icon={<Crosshair className="w-5 h-5" />} />
        <StatCard title="Peak Output" value="54.2K" trend={-1.5} icon={<Crosshair className="w-5 h-5" />} />
      </div>

      <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
        <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Historical Damage Output</h3>
        <DamageChart />
      </div>
    </div>
  );
}
