import { prisma } from '@/lib/db';
import { wareraApi } from '@/lib/warera-api';

export async function collectMarketPrices(): Promise<void> {
    try {
        const prices: any = await wareraApi.getMarketPrices();
        
        const snapshotDate = new Date();
        // Round to nearest hour
        snapshotDate.setMinutes(0, 0, 0);
        
        await prisma.marketPriceSnapshot.create({
            data: {
                snapshotDate,
                ammo: prices.ammo || 0,
                bread: prices.bread || 0,
                steak: prices.steak || 0,
                cookedFish: prices.cookedFish || 0,
                cocain: prices.cocain || 0,
                iron: prices.iron || 0,
                lead: prices.lead || 0,
                limestone: prices.limestone || 0,
                steel: prices.steel || 0,
                concrete: prices.concrete || 0,
                oil: prices.oil || 0,
                lightAmmo: prices.lightAmmo || 0,
                heavyAmmo: prices.heavyAmmo || 0,
                scraps: prices.scraps || 0,
                case1: prices.case1 || 0,
                case2: prices.case2 || 0,
            }
        });
        
        console.log(`Successfully collected market prices for ${snapshotDate.toISOString()}`);
    } catch (err) {
        console.error("Error in collectMarketPrices:", err);
    }
}
