import { PlayerData } from '../../../src/optimizer/models/player';
import { MarketSnapshot, MarketPrices } from '../../../src/optimizer/models/market';
import { GearItem } from '../../../src/optimizer/models/gear';
import { generateGearCandidates } from '../../../src/optimizer/core/candidateGenerator';
import { simulateCombat } from '../../../src/optimizer/simulation/combatSimulator';
import { simulateEconomy } from '../../../src/optimizer/simulation/economySimulator';
import { scoreResult, OptimizationMode } from '../../../src/optimizer/core/scoring';

self.onmessage = (e: MessageEvent) => {
  const { player, market, availableGear, mode } = e.data as {
    player: PlayerData;
    market: MarketSnapshot;
    availableGear: GearItem[];
    mode: OptimizationMode;
  };

  self.postMessage({ type: 'progress', message: 'Generating candidates...' });

  const candidates = generateGearCandidates(player, market, availableGear);

  if (candidates.length === 0) {
    self.postMessage({ type: 'error', error: 'No valid candidates found.' });
    return;
  }

  let bestScore = -Infinity;
  let bestBuild: any = null;

  let count = 0;
  const total = candidates.length;

  // Economy is independent of gear in this simplified model, precalculate it
  const economy = simulateEconomy(player, market);
  const combatResult: any = {};

  for (const gearSet of candidates) {
    simulateCombat(player, gearSet, market, combatResult);
    const netProfit = economy.companyProfit + combatResult.combatProfit;
    
    // We do NOT allocate result object here, we just pass the wrapper
    // Wait, scoreResult needs a SimulationResult. We can inline that too.
    const result = { combat: combatResult, economy, netProfit };
    const score = scoreResult(result, mode);

    if (score > bestScore) {
      bestScore = score;
      bestBuild = { gearSet, result: { combat: { ...combatResult }, economy, netProfit }, score };
    }

    count++;
    if (count % 1000 === 0) {
      self.postMessage({ type: 'progress', count, total, bestScore });
    }
  }

  self.postMessage({ type: 'done', bestBuild });
};
