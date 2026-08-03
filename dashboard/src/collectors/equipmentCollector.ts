import { prisma } from '@/lib/db';
import { wareraApi } from '@/lib/warera-api';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const rarityScores: Record<string, number> = {
    common: 10,
    uncommon: 25,
    rare: 45,
    epic: 65,
    legendary: 85,
    mythic: 100
};

export async function collectEquipmentSnapshots(): Promise<{ collected: number; errors: number }> {
    let collected = 0;
    let errors = 0;

    try {
        const userLinks = await prisma.userLink.findMany();
        
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        for (const link of userLinks) {
            try {
                const equipment = await wareraApi.getCurrentEquipment(link.wareraUserId);
                
                let totalScore = 0;
                let equippedCount = 0;

                const equipmentData: Record<string, any> = {};

                const slots = ['weapon', 'helmet', 'chest', 'pants', 'gloves', 'boots'] as const;

                for (const slot of slots) {
                    const item = (equipment as any)[slot];
                    if (item) {
                        const rarity = (item.rarity || item.tier || 'common').toLowerCase();
                        totalScore += rarityScores[rarity] || 0;
                        equippedCount++;
                        equipmentData[slot] = {
                            code: item.code,
                            tier: rarity,
                            state: item.state,
                            maxState: item.maxState
                        };
                    }
                }

                const complianceScore = equippedCount > 0 ? (totalScore / 6) : 0;

                const dbData = {
                    complianceScore,
                    weaponCode: equipmentData.weapon?.code || null,
                    weaponTier: equipmentData.weapon?.tier || null,
                    weaponState: equipmentData.weapon?.state || null,
                    weaponMaxState: equipmentData.weapon?.maxState || null,

                    helmetCode: equipmentData.helmet?.code || null,
                    helmetTier: equipmentData.helmet?.tier || null,
                    helmetState: equipmentData.helmet?.state || null,
                    helmetMaxState: equipmentData.helmet?.maxState || null,

                    chestCode: equipmentData.chest?.code || null,
                    chestTier: equipmentData.chest?.tier || null,
                    chestState: equipmentData.chest?.state || null,
                    chestMaxState: equipmentData.chest?.maxState || null,

                    pantsCode: equipmentData.pants?.code || null,
                    pantsTier: equipmentData.pants?.tier || null,
                    pantsState: equipmentData.pants?.state || null,
                    pantsMaxState: equipmentData.pants?.maxState || null,

                    glovesCode: equipmentData.gloves?.code || null,
                    glovesTier: equipmentData.gloves?.tier || null,
                    glovesState: equipmentData.gloves?.state || null,
                    glovesMaxState: equipmentData.gloves?.maxState || null,

                    bootsCode: equipmentData.boots?.code || null,
                    bootsTier: equipmentData.boots?.tier || null,
                    bootsState: equipmentData.boots?.state || null,
                    bootsMaxState: equipmentData.boots?.maxState || null,
                };

                await prisma.equipmentSnapshot.upsert({
                    where: {
                        wareraUserId_snapshotDate: {
                            wareraUserId: link.wareraUserId,
                            snapshotDate: today
                        }
                    },
                    update: dbData,
                    create: {
                        wareraUserId: link.wareraUserId,
                        snapshotDate: today,
                        ...dbData
                    }
                });

                collected++;
            } catch (err) {
                console.error(`Error collecting equipment snapshot for ${link.wareraUserId}:`, err);
                errors++;
            }

            await sleep(500);
        }
    } catch (err) {
        console.error("Error in collectEquipmentSnapshots:", err);
    }

    return { collected, errors };
}
