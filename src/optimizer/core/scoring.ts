import { CombatResult } from '../simulation/combatSimulator';
import { EconomyResult } from '../simulation/economySimulator';

export type OptimizationMode = 
  | 'maxDamage'
  | 'sustainable'
  | 'warEco'
  | 'profit';

export interface SimulationResult {
  combat: CombatResult;
  economy: EconomyResult;
  netProfit: number; // total overall profit
}

export function scoreResult(result: SimulationResult, mode: OptimizationMode): number {
  const { combat, economy, netProfit } = result;

  switch (mode) {
    case 'maxDamage':
      return combat.damage;

    case 'sustainable':
      // Goal: maximize damage while keeping daily net loss low or positive
      // We will heavily penalize negative netProfit, but otherwise rank by damage
      if (netProfit < 0) {
        return combat.damage - Math.abs(netProfit) * 10; // penalty weight
      }
      return combat.damage;

    case 'profit':
      return netProfit;

    case 'warEco':
      // Balance fighting power and economic outcome
      // Using an arbitrary normalization factor for this example
      const normalizedDamage = combat.damage / 1000;
      const normalizedProfit = netProfit / 1000;
      return (normalizedDamage * 0.7) + (normalizedProfit * 0.3);

    default:
      return 0;
  }
}
