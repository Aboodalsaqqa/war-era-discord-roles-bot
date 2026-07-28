import { PlayerData } from '../models/player';
import { MarketSnapshot } from '../models/market';

export interface EconomyResult {
  companyProfit: number;
  wagesPaid: number;
  productionCost: number;
  productSalesValue: number;
  taxes: number;
}

export function simulateEconomy(
  player: PlayerData,
  market: MarketSnapshot
): EconomyResult {
  let companyProfit = 0;
  let wagesPaid = 0;
  let productionCost = 0;
  let productSalesValue = 0;
  let taxes = 0;

  for (const company of player.companies) {
    // Basic production calculation
    // base production * company quality * player production skill
    const baseProduction = 100 * company.quality;
    const productionSkillMultiplier = 1 + (player.skills.production / 100);
    const workerBonus = company.workers * 0.1; 
    
    const totalOutput = baseProduction * productionSkillMultiplier * (1 + workerBonus) * (1 + company.productionBonus);
    
    // Revenue
    const productPrice = market.prices.productPrices[company.type] || 10;
    const revenue = totalOutput * productPrice;
    
    // Costs
    const workerCost = company.workers * market.prices.wagePerWorker;
    const inputCost = revenue * 0.2; // arbitrary input cost model
    
    const companyTaxes = revenue * 0.05; // 5% tax

    productSalesValue += revenue;
    wagesPaid += workerCost;
    productionCost += inputCost;
    taxes += companyTaxes;

    const netProfit = revenue - workerCost - inputCost - companyTaxes;
    companyProfit += netProfit;
  }

  return {
    companyProfit,
    wagesPaid,
    productionCost,
    productSalesValue,
    taxes
  };
}
