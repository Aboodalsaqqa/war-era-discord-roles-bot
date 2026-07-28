export type GearSlot = 'weapon' | 'helmet' | 'chest' | 'pants' | 'gloves' | 'boots';
export type GearTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface GearStats {
  attack?: number;
  precision?: number;
  critChance?: number;
  critDamage?: number;
  armor?: number;
  dodge?: number;
  health?: number;
  lootChance?: number;
}

export interface GearItem {
  id: string;
  slot: GearSlot;
  tier: GearTier;
  levelReq: number;
  stats: GearStats;
  
  // Economic impact
  purchasePrice: number;
  repairCostPerHit: number;
  durabilityLossPerHit: number;
}
