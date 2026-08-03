import { useState, useEffect } from 'react';
import './index.css';

// Type definitions to mirror our models
import { PlayerData } from '../../src/optimizer/models/player';
import { OptimizationMode } from '../../src/optimizer/core/scoring';
import { MarketSnapshot } from '../../src/optimizer/models/market';
import { GearItem } from '../../src/optimizer/models/gear';

function App() {
  const [username, setUsername] = useState('PlayerOne');
  const [mode, setMode] = useState<OptimizationMode>('sustainable');
  
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{count: number, total: number} | null>(null);
  const [statusMsg, setStatusMsg] = useState('Ready');
  const [result, setResult] = useState<any>(null);

  const handleOptimize = async () => {
    setIsRunning(true);
    setResult(null);
    setProgress(null);
    setStatusMsg('Fetching player and market data...');

    // In a real app, we'd fetch this. For now, we mock it mirroring the backend client.
    const player: PlayerData = {
      username,
      level: 40,
      skills: { attack: 100, precision: 80, critChance: 50, critDamage: 40, armor: 20, dodge: 20, production: 120, management: 30, entrepreneurship: 25 },
      companies: [{ id: 'c1', type: 'food', quality: 5, workers: 10, activeEngines: 1, productionBonus: 0.1 }],
      countryBonus: 0.2,
      resourceBonus: 0,
      dailyHitsTarget: 500,
      budget: 1000000
    };

    const market: MarketSnapshot = {
      lastUpdated: new Date().toISOString(),
      prices: { ammoPricePerHit: 10, pillPricePerBattle: 1000, foodPricePerBattle: 200, caseValue: 15000, eliteCaseValue: 50000, wagePerWorker: 100, productPrices: { food: 10, weapons: 20, tickets: 50 } },
      gear: []
    };

    const availableGear: GearItem[] = [
      { id: 'g1', slot: 'weapon', tier: 'epic', levelReq: 40, stats: { attack: 135 }, purchasePrice: 160000, repairCostPerHit: 5, durabilityLossPerHit: 0.1 },
      { id: 'g2', slot: 'weapon', tier: 'legendary', levelReq: 40, stats: { attack: 200 }, purchasePrice: 500000, repairCostPerHit: 15, durabilityLossPerHit: 0.1 },
      { id: 'g3', slot: 'helmet', tier: 'rare', levelReq: 30, stats: { critChance: 10, critDamage: 20 }, purchasePrice: 50000, repairCostPerHit: 2, durabilityLossPerHit: 0.1 },
      { id: 'g4', slot: 'chest', tier: 'epic', levelReq: 40, stats: { armor: 100 }, purchasePrice: 100000, repairCostPerHit: 4, durabilityLossPerHit: 0.1 },
      { id: 'g5', slot: 'pants', tier: 'epic', levelReq: 40, stats: { armor: 80 }, purchasePrice: 90000, repairCostPerHit: 3, durabilityLossPerHit: 0.1 },
      { id: 'g6', slot: 'gloves', tier: 'epic', levelReq: 40, stats: { precision: 50 }, purchasePrice: 80000, repairCostPerHit: 3, durabilityLossPerHit: 0.1 },
      { id: 'g7', slot: 'boots', tier: 'epic', levelReq: 40, stats: { dodge: 50 }, purchasePrice: 80000, repairCostPerHit: 3, durabilityLossPerHit: 0.1 },
    ];

    setStatusMsg('Starting optimizer engine...');

    const worker = new Worker(new URL('./worker/OptimizerWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'progress') {
        if (data.count) {
          setProgress({ count: data.count, total: data.total });
          setStatusMsg(`Simulating ${data.count} / ${data.total} combinations...`);
        } else {
          setStatusMsg(data.message);
        }
      } else if (data.type === 'error') {
        setStatusMsg(`Error: ${data.error}`);
        setIsRunning(false);
        worker.terminate();
      } else if (data.type === 'done') {
        setResult(data.bestBuild);
        setStatusMsg('Optimization complete!');
        setIsRunning(false);
        worker.terminate();
      }
    };

    worker.postMessage({ player, market, availableGear, mode });
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>WarEra Build Optimizer</h1>
        <p>Market-aware brute-force simulator for finding the perfect daily setup.</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label>Player Username</label>
          <input 
            type="text" 
            className="form-input" 
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Optimization Mode</label>
          <select 
            className="form-select" 
            value={mode} 
            onChange={e => setMode(e.target.value as OptimizationMode)}
          >
            <option value="maxDamage">Maximum Damage (Ignore Costs)</option>
            <option value="sustainable">Sustainable Daily (Profit &gt; 0)</option>
            <option value="warEco">War / Economy Balance</option>
            <option value="profit">Pure Profit (Maximize Economy)</option>
          </select>
        </div>

        <button 
          className="btn-primary" 
          onClick={handleOptimize}
          disabled={isRunning}
        >
          {isRunning ? 'Optimizing...' : 'Run Optimizer Engine'}
        </button>

        {statusMsg !== 'Ready' && (
          <div style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {statusMsg}
            {progress && (
              <div style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${(progress.count / progress.total) * 100}%`, background: 'var(--accent-blue)', height: '100%', transition: 'width 0.2s' }}></div>
              </div>
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="card" style={{ marginTop: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
            Optimal Build Found
          </h2>
          
          <div className="results-grid">
            <div className="stat-box">
              <div className="label">Expected Damage</div>
              <div className="value" style={{ color: '#60a5fa' }}>{Math.round(result.result.combat.damage).toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="label">Daily Net Profit</div>
              <div className="value">${Math.round(result.result.netProfit).toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="label">Daily Repair Cost</div>
              <div className="value" style={{ color: '#f87171' }}>${Math.round(result.result.combat.repairCost).toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="label">Company Output</div>
              <div className="value">${Math.round(result.result.economy.companyProfit).toLocaleString()}</div>
            </div>
          </div>

          <h3 style={{ marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Recommended Gear Setup</h3>
          <div className="gear-list">
            {result.gearSet.map((item: any, i: number) => (
              <div key={i} className="gear-item">
                <span className="gear-slot">{item.slot}</span>
                <span style={{ display: 'flex', gap: '1rem' }}>
                  <span style={{ color: item.tier === 'legendary' ? '#fbbf24' : item.tier === 'epic' ? '#c084fc' : '#60a5fa' }}>{item.tier}</span>
                  <span>(Cost: ${item.purchasePrice.toLocaleString()})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
