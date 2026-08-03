import AttendanceHeatmap from '@/components/charts/AttendanceHeatmap';

export default function AttendanceAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Attendance Tracking</h2>
      
      <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
        <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Weekly Muster Rate</h3>
        <AttendanceHeatmap />
      </div>
    </div>
  );
}
