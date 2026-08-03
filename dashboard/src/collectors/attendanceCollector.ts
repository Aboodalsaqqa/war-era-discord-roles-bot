import { prisma } from '@/lib/db';

export async function deriveAttendance(): Promise<{ processed: number }> {
    let processed = 0;
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const snapshots = await prisma.memberSnapshot.findMany({
            where: {
                snapshotDate: today
            }
        });

        for (const snapshot of snapshots) {
            const totalDamage = snapshot.totalDamage || 0;
            const weeklyDamage = snapshot.weeklyDamage || 0;
            const foughtInBattle = weeklyDamage > 0;
            
            await prisma.attendanceRecord.upsert({
                where: {
                    wareraUserId_date: {
                        wareraUserId: snapshot.wareraUserId,
                        date: today
                    }
                },
                update: {
                    wasOnline: true,
                    foughtInBattle,
                    totalDamage
                },
                create: {
                    wareraUserId: snapshot.wareraUserId,
                    date: today,
                    wasOnline: true,
                    foughtInBattle,
                    totalDamage
                }
            });
            
            processed++;
        }
    } catch (err) {
        console.error("Error in deriveAttendance:", err);
    }

    return { processed };
}
