import { MarketSnapshot } from '../models/market';
import { GearItem } from '../models/gear';

const MARKET_PROXY_URL = 'https://warera-proxy.stuitjejuniya.workers.dev/gear-ranges';

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  // In a real implementation, fetch from MARKET_PROXY_URL
  // For the clean-room implementation, we'll return a stub
  
  return {
    lastUpdated: new Date().toISOString(),
    prices: {
      ammoPricePerHit: 10,
      pillPricePerBattle: 1000,
      foodPricePerBattle: 200,
      caseValue: 15000,
      eliteCaseValue: 50000,
      wagePerWorker: 100,
      productPrices: {
        food: 10,
        weapons: 20,
        tickets: 50
      }
    },
    gear: [
      {
        slot: 'weapon',
        tier: 'epic',
        level: 40,
        statRange: {
          attack: { min: 100, p25: 120, p50: 135, p75: 150, max: 170 }
        },
        priceRange: { min: 100000, p25: 130000, p50: 160000, p75: 210000, max: 300000 },
        samples: 27,
        lastUpdated: new Date().toISOString()
      }
    ]
  };
}

export async function fetchAvailableGear(): Promise<GearItem[]> {
  // Mock available gear that the user can choose from based on the market snapshot
  return [
    {
      id: 'g1',
      slot: 'weapon',
      tier: 'epic',
      levelReq: 40,
      stats: { attack: 135 },
      purchasePrice: 160000,
      repairCostPerHit: 5,
      durabilityLossPerHit: 0.1
    },
    {
      id: 'g2',
      slot: 'helmet',
      tier: 'rare',
      levelReq: 30,
      stats: { critChance: 10, critDamage: 20 },
      purchasePrice: 50000,
      repairCostPerHit: 2,
      durabilityLossPerHit: 0.1
    }
  ];
}
