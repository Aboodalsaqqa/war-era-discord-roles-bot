import { PlayerData } from '../models/player';
import { GearItem } from '../models/gear';
import { MarketSnapshot } from '../models/market';

export interface CombatResult {
  damage: number;
  combatProfit: number; // pure profit from fighting
  caseValue: number;
  eliteCaseValue: number;
  bountyValue: number;
  repairCost: number;
  ammoCost: number;
  pillCost: number;
  foodCost: number;
}

export function simulateCombat(
  player: PlayerData,
  gearSet: GearItem[],
  market: MarketSnapshot,
  outResult: CombatResult
): void {
  let totalAttack = player.skills.attack;
  let totalArmor = player.skills.armor;
  let totalCritChance = player.skills.critChance;
  let totalCritDamage = player.skills.critDamage;
  
  let repairCost = 0;

  for (let i = 0; i < gearSet.length; i++) {
    const item = gearSet[i];
    const stats = item.stats;
    if (stats.attack) totalAttack += stats.attack;
    if (stats.armor) totalArmor += stats.armor;
    if (stats.critChance) totalCritChance += stats.critChance;
    if (stats.critDamage) totalCritDamage += stats.critDamage;
    
    repairCost += item.repairCostPerHit * player.dailyHitsTarget;
  }

  const avgCritMultiplier = 1 + (totalCritChance / 100) * (totalCritDamage / 100);
  const dmgPerHit = totalAttack * avgCritMultiplier;
  const damage = dmgPerHit * player.dailyHitsTarget;

  const bountyValue = damage * 0.05; 
  const caseDropChance = 0.1;
  const eliteCaseDropChance = 0.01;

  const caseValue = player.dailyHitsTarget * caseDropChance * market.prices.caseValue;
  const eliteCaseValue = player.dailyHitsTarget * eliteCaseDropChance * market.prices.eliteCaseValue;

  const ammoCost = player.dailyHitsTarget * market.prices.ammoPricePerHit;
  const battles = player.dailyHitsTarget / 10;
  const pillCost = battles * market.prices.pillPricePerBattle;
  const foodCost = battles * market.prices.foodPricePerBattle;

  const totalRewards = bountyValue + caseValue + eliteCaseValue;
  const totalCosts = repairCost + ammoCost + pillCost + foodCost;
  const combatProfit = totalRewards - totalCosts;

  outResult.damage = damage;
  outResult.combatProfit = combatProfit;
  outResult.caseValue = caseValue;
  outResult.eliteCaseValue = eliteCaseValue;
  outResult.bountyValue = bountyValue;
  outResult.repairCost = repairCost;
  outResult.ammoCost = ammoCost;
  outResult.pillCost = pillCost;
  outResult.foodCost = foodCost;
}
