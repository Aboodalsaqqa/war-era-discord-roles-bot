import MarketPriceTrend from '@/components/charts/MarketPriceTrend';

export default function MarketPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Market Intel</h2>
      
      <div className="glass-card p-6 rounded-xl border border-slate-800 bg-slate-900/40">
        <h3 className="text-lg font-medium text-white mb-6 uppercase tracking-wider">Resource Price Index</h3>
        <MarketPriceTrend />
      </div>
    </div>
  );
}
