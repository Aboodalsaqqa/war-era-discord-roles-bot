import EquipmentComplianceGauge from '@/components/charts/EquipmentComplianceGauge';

export default function EquipmentAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Equipment Logistics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
          <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Compliance Rate</h3>
          <EquipmentComplianceGauge />
        </div>
      </div>
    </div>
  );
}
