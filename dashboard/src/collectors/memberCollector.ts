import { prisma } from '@/lib/db';
import { wareraApi } from '@/lib/warera-api';
import { calculatePerformanceScore } from '@/lib/scoring';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function collectMemberSnapshots(): Promise<{ collected: number; errors: number }> {
    let collected = 0;
    let errors = 0;

    try {
        const userLinks = await prisma.userLink.findMany();
        
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        for (const link of userLinks) {
            try {
                const profile: any = await wareraApi.getUserProfile(link.wareraUserId);
                
                // Calculate specialization
                const skills = profile.skills || {};
                const warScore = (skills.attack || 0) + (skills.precision || 0) + 
                                 (skills.critChance || 0) + (skills.critDamage || 0) + 
                                 (skills.armor || 0) + (skills.dodge || 0) + (skills.lootChance || 0);
                
                const ecoScore = (skills.production || 0) + (skills.management || 0) + 
                                 (skills.entrepreneurship || 0) + (skills.companies || 0);
                
                let specialization = 'hybrid';
                if (warScore >= ecoScore * 1.5) specialization = 'war';
                else if (ecoScore >= warScore * 1.5) specialization = 'economy';

                const performanceScore = calculatePerformanceScore ? calculatePerformanceScore(profile) : 0;

                await prisma.memberSnapshot.upsert({
                    where: {
                        wareraUserId_snapshotDate: {
                            wareraUserId: link.wareraUserId,
                            snapshotDate: today
                        }
                    },
                    update: {
                        specialization,
                        performanceScore,
                        level: profile.leveling?.level || 0,
                        militaryRank: profile.militaryRank || 0,
                        country: profile.country || 'Unknown',
                        muId: profile.muId || null,
                        attackLevel: skills.attack || 0,
                        precisionLevel: skills.precision || 0,
                        critChanceLevel: skills.critChance || 0,
                        critDamageLevel: skills.critDamage || 0,
                        armorLevel: skills.armor || 0,
                        dodgeLevel: skills.dodge || 0,
                        lootChanceLevel: skills.lootChance || 0,
                        productionLevel: skills.production || 0,
                        managementLevel: skills.management || 0,
                        entrepreneurLevel: skills.entrepreneurship || 0,
                        companiesLevel: skills.companies || 0,
                        totalDamage: profile.rankings?.totalDamage || 0,
                        weeklyDamage: profile.rankings?.weeklyDamage || 0,
                    },
                    create: {
                        wareraUserId: link.wareraUserId,
                        snapshotDate: today,
                        specialization,
                        performanceScore,
                        level: profile.leveling?.level || 0,
                        militaryRank: profile.militaryRank || 0,
                        country: profile.country || 'Unknown',
                        muId: profile.muId || null,
                        attackLevel: skills.attack || 0,
                        precisionLevel: skills.precision || 0,
                        critChanceLevel: skills.critChance || 0,
                        critDamageLevel: skills.critDamage || 0,
                        armorLevel: skills.armor || 0,
                        dodgeLevel: skills.dodge || 0,
                        lootChanceLevel: skills.lootChance || 0,
                        productionLevel: skills.production || 0,
                        managementLevel: skills.management || 0,
                        entrepreneurLevel: skills.entrepreneurship || 0,
                        companiesLevel: skills.companies || 0,
                        totalDamage: profile.rankings?.totalDamage || 0,
                        weeklyDamage: profile.rankings?.weeklyDamage || 0,
                    }
                });

                collected++;
            } catch (err) {
                console.error(`Error collecting member snapshot for ${link.wareraUserId}:`, err);
                errors++;
            }

            await sleep(500);
        }
    } catch (err) {
        console.error("Error in collectMemberSnapshots:", err);
    }

    return { collected, errors };
}
