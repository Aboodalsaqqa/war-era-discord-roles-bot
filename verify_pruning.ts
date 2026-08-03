import { PlayerData } from './src/optimizer/models/player';
import { MarketSnapshot } from './src/optimizer/models/market';
import { GearItem, GearSlot } from './src/optimizer/models/gear';
import { generateGearCandidates } from './src/optimizer/core/candidateGenerator';
import { simulateCombat } from './src/optimizer/simulation/combatSimulator';
import { simulateEconomy } from './src/optimizer/simulation/economySimulator';
import { scoreResult, OptimizationMode } from './src/optimizer/core/scoring';

// Stable random number generator for deterministic tests
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

function generateDeterministicGear(countPerSlot: number, seed: number): GearItem[] {
  const rng = new SeededRandom(seed);
  const slots: GearSlot[] = ['weapon', 'helmet', 'chest', 'pants', 'gloves', 'boots'];
  const gear: GearItem[] = [];
  
  let idCounter = 1;
  for (const slot of slots) {
    for (let i = 0; i < countPerSlot; i++) {
      gear.push({
        id: `mock_${idCounter++}`,
        slot,
        tier: 'epic',
        levelReq: 40,
        stats: { 
          attack: Math.floor(rng.next() * 50) + 100,
          armor: Math.floor(rng.next() * 30) + 10,
        },
        purchasePrice: Math.floor(rng.next() * 50000) + 10000,
        repairCostPerHit: Math.floor(rng.next() * 5) + 1,
        durabilityLossPerHit: 0.1
      });
    }
  }
  return gear;
}

function runOptimizer(player: PlayerData, market: MarketSnapshot, gear: GearItem[], usePruning: boolean, mode: OptimizationMode) {
  const candidates = generateGearCandidates(player, market, gear, usePruning);
  
  let bestScore = -Infinity;
  let bestBuildIds = '';
  
  const economy = simulateEconomy(player, market);
  const combatResult: any = {};

  for (const gearSet of candidates) {
    simulateCombat(player, gearSet, market, combatResult);
    const netProfit = economy.companyProfit + combatResult.combatProfit;
    const score = scoreResult({ combat: combatResult, economy, netProfit }, mode);
    
    if (score > bestScore) {
      bestScore = score;
      bestBuildIds = gearSet.map(g => g.id).sort().join(',');
    }
  }
  return { bestScore, bestBuildIds, candidateCount: candidates.length };
}

const mockPlayer: PlayerData = {
  username: 'TestPlayer',
  level: 40,
  skills: { attack: 100, precision: 80, critChance: 50, critDamage: 40, armor: 20, dodge: 20, production: 120, management: 30, entrepreneurship: 25 },
  companies: [],
  countryBonus: 0,
  resourceBonus: 0,
  dailyHitsTarget: 500,
  budget: 50000000 
};

const mockMarket: MarketSnapshot = {
  lastUpdated: new Date().toISOString(),
  prices: { ammoPricePerHit: 10, pillPricePerBattle: 1000, foodPricePerBattle: 200, caseValue: 15000, eliteCaseValue: 50000, wagePerWorker: 100, productPrices: {} },
  gear: []
};

const MODES: OptimizationMode[] = ['maxDamage', 'sustainable', 'profit'];
let passed = 0;
let failed = 0;

console.log('--- Verifying Pareto Pruning Correctness ---');

// We use 5 items per slot (15,625 total combinations) so the unpruned version runs fast enough for dozens of tests
const TESTS = 20;

for (let i = 0; i < TESTS; i++) {
  const gear = generateDeterministicGear(5, 1337 + i);
  
  for (const mode of MODES) {
    const unpruned = runOptimizer(mockPlayer, mockMarket, gear, false, mode);
    const pruned = runOptimizer(mockPlayer, mockMarket, gear, true, mode);
    
    if (unpruned.bestScore === pruned.bestScore && unpruned.bestBuildIds === pruned.bestBuildIds) {
      passed++;
    } else {
      console.error(`❌ Mismatch in Test ${i} mode ${mode}`);
      console.error(`  Unpruned: Score ${unpruned.bestScore}, IDs: ${unpruned.bestBuildIds}, count: ${unpruned.candidateCount}`);
      console.error(`  Pruned:   Score ${pruned.bestScore}, IDs: ${pruned.bestBuildIds}, count: ${pruned.candidateCount}`);
      failed++;
    }
  }
}

console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
