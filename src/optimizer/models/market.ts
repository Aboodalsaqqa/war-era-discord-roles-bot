import { GearSlot, GearTier } from './gear';

export interface StatRange {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  max: number;
}

export interface PriceRange {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  max: number;
}

export interface MarketGearSnapshot {
  slot: GearSlot;
  tier: GearTier;
  level: number;
  statRange: Record<string, StatRange>;
  priceRange: PriceRange;
  samples: number;
  lastUpdated: string;
}

export interface MarketPrices {
  ammoPricePerHit: number;
  pillPricePerBattle: number;
  foodPricePerBattle: number;
  caseValue: number;
  eliteCaseValue: number;
  productPrices: Record<string, number>;
  wagePerWorker: number;
}

export interface MarketSnapshot {
  gear: MarketGearSnapshot[];
  prices: MarketPrices;
  lastUpdated: string;
}
