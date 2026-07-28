import { GearItem, GearSlot } from '../models/gear';
import { PlayerData } from '../models/player';
import { MarketSnapshot } from '../models/market';

function isStrictlyBetter(a: GearItem, b: GearItem): boolean {
  // A is strictly better than B if A is at least as good in all positive attributes
  // and costs less or equal, AND A is strictly better in at least one attribute.
  
  if (a.purchasePrice > b.purchasePrice) return false;
  if (a.repairCostPerHit > b.repairCostPerHit) return false;
  
  const statsA = a.stats;
  const statsB = b.stats;
  
  if ((statsA.attack || 0) < (statsB.attack || 0)) return false;
  if ((statsA.precision || 0) < (statsB.precision || 0)) return false;
  if ((statsA.critChance || 0) < (statsB.critChance || 0)) return false;
  if ((statsA.critDamage || 0) < (statsB.critDamage || 0)) return false;
  if ((statsA.armor || 0) < (statsB.armor || 0)) return false;
  if ((statsA.dodge || 0) < (statsB.dodge || 0)) return false;
  if ((statsA.health || 0) < (statsB.health || 0)) return false;

  // If we reach here, A is >= B in all fields. We just need to ensure A is NOT exactly equal to B (or if it is, we just drop the duplicate)
  // To safely drop duplicates, we return true if A is strictly better OR if they are identical but A's id < B's id.
  const isBetter = 
    a.purchasePrice < b.purchasePrice ||
    a.repairCostPerHit < b.repairCostPerHit ||
    (statsA.attack || 0) > (statsB.attack || 0) ||
    (statsA.armor || 0) > (statsB.armor || 0);
    
  if (isBetter) return true;
  return a.id < b.id; // tie breaker for exact duplicates
}

function pruneDominatedGear(items: GearItem[]): GearItem[] {
  const pruned: GearItem[] = [];
  for (let i = 0; i < items.length; i++) {
    let dominated = false;
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      if (isStrictlyBetter(items[j], items[i])) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      pruned.push(items[i]);
    }
  }
  return pruned;
}

export function generateGearCandidates(
  player: PlayerData,
  market: MarketSnapshot,
  availableGear: GearItem[],
  usePruning: boolean = true
): GearItem[][] {
  const validGear = availableGear.filter(g => 
    g.levelReq <= player.level && g.purchasePrice <= player.budget
  );

  const bySlot: Record<GearSlot, GearItem[]> = {
    weapon: [], helmet: [], chest: [], pants: [], gloves: [], boots: []
  };

  for (const item of validGear) {
    bySlot[item.slot].push(item);
  }

  // PRUNING STEP:
  if (usePruning) {
    bySlot.weapon = pruneDominatedGear(bySlot.weapon);
    bySlot.helmet = pruneDominatedGear(bySlot.helmet);
    bySlot.chest = pruneDominatedGear(bySlot.chest);
    bySlot.pants = pruneDominatedGear(bySlot.pants);
    bySlot.gloves = pruneDominatedGear(bySlot.gloves);
    bySlot.boots = pruneDominatedGear(bySlot.boots);
  }

  const combinations: GearItem[][] = [];
  for (const weapon of bySlot.weapon.length ? bySlot.weapon : [null]) {
    for (const helmet of bySlot.helmet.length ? bySlot.helmet : [null]) {
      for (const chest of bySlot.chest.length ? bySlot.chest : [null]) {
        for (const pants of bySlot.pants.length ? bySlot.pants : [null]) {
          for (const gloves of bySlot.gloves.length ? bySlot.gloves : [null]) {
            for (const boots of bySlot.boots.length ? bySlot.boots : [null]) {
              const combo = [weapon, helmet, chest, pants, gloves, boots].filter(Boolean) as GearItem[];
              
              const totalCost = combo.reduce((sum, item) => sum + item.purchasePrice, 0);
              if (totalCost <= player.budget) {
                combinations.push(combo);
              }
            }
          }
        }
      }
    }
  }

  return combinations;
}
