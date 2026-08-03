import { PlayerData } from './src/optimizer/models/player';
import { MarketSnapshot } from './src/optimizer/models/market';
import { GearItem, GearSlot } from './src/optimizer/models/gear';
import { generateGearCandidates } from './src/optimizer/core/candidateGenerator';

function generateMockGear(countPerSlot: number): GearItem[] {
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
        stats: { attack: Math.floor(Math.random() * 50) + 100 },
        purchasePrice: Math.floor(Math.random() * 50000) + 10000,
        repairCostPerHit: Math.floor(Math.random() * 5) + 1,
        durabilityLossPerHit: 0.1
      });
    }
  }
  return gear;
}

const mockPlayer: PlayerData = {
  username: 'BenchPlayer',
  level: 40,
  skills: { attack: 100, precision: 80, critChance: 50, critDamage: 40, armor: 20, dodge: 20, production: 120, management: 30, entrepreneurship: 25 },
  companies: [],
  countryBonus: 0,
  resourceBonus: 0,
  dailyHitsTarget: 500,
  budget: 50000000 // practically unlimited for benchmark 50M
};

const mockMarket: MarketSnapshot = {
  lastUpdated: new Date().toISOString(),
  prices: { ammoPricePerHit: 10, pillPricePerBattle: 1000, foodPricePerBattle: 200, caseValue: 15000, eliteCaseValue: 50000, wagePerWorker: 100, productPrices: {} },
  gear: []
};

console.log('--- Benchmarking Candidate Generator ---');
const sizes = [2, 4, 6, 8, 10]; // Items per slot

for (const size of sizes) {
  const gear = generateMockGear(size);
  console.log(`\nItems per slot: ${size} (Total pool: ${gear.length})`);
  console.log(`Theoretical combinations: ${Math.pow(size, 6)}`);
  
  const start = performance.now();
  const candidates = generateGearCandidates(mockPlayer, mockMarket, gear);
  const end = performance.now();
  
  console.log(`Generated: ${candidates.length} valid builds`);
  console.log(`Time taken: ${(end - start).toFixed(2)} ms`);
}
