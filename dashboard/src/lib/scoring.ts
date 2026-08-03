import { SPECIALIZATION_THRESHOLD, TIER_ORDER } from './constants';

export function getSpecialization(skills: { war: number; eco: number }): 'war' | 'economy' | 'hybrid' {
  if (skills.war >= skills.eco * SPECIALIZATION_THRESHOLD) {
    return 'war';
  }
  if (skills.eco >= skills.war * SPECIALIZATION_THRESHOLD) {
    return 'economy';
  }
  return 'hybrid';
}

export interface ScoreInput {
  snapshot: {
    damageOutput: number;
    level: number;
    warSkills: number;
    ecoSkills: number;
  };
  muAverageDamage: number;
  attendanceDays: number; // out of 30
  equipmentTiers: string[];
}

export function calculatePerformanceScore(input: ScoreInput): number {
  const { snapshot, muAverageDamage, attendanceDays, equipmentTiers } = input;
  
  // 1. Damage output (35%)
  let damageScore = 0;
  if (muAverageDamage > 0) {
    const damageRatio = snapshot.damageOutput / muAverageDamage;
    damageScore = Math.min(100, damageRatio * 100);
  } else {
    damageScore = snapshot.damageOutput > 0 ? 100 : 0;
  }
  
  // 2. Attendance (25%)
  const attendanceScore = Math.min(100, (attendanceDays / 30) * 100);
  
  // 3. Equipment compliance (20%)
  let equipmentScore = 0;
  if (equipmentTiers.length > 0) {
    const totalScore = equipmentTiers.reduce((acc, tier) => {
      const tierLower = tier.toLowerCase() as keyof typeof TIER_ORDER;
      return acc + (TIER_ORDER[tierLower] || 0);
    }, 0);
    // Assuming max tier is mythic (5)
    const maxPossibleScore = equipmentTiers.length * 5;
    equipmentScore = (totalScore / maxPossibleScore) * 100;
  }

  // 4. Growth (10%)
  const growthScore = Math.min(100, (snapshot.level / 100) * 50 + ((snapshot.warSkills + snapshot.ecoSkills) / 1000) * 50);

  // 5. Specialization alignment (10%)
  const spec = getSpecialization({ war: snapshot.warSkills, eco: snapshot.ecoSkills });
  const specScore = spec === 'war' ? 100 : spec === 'hybrid' ? 50 : 25;

  const totalScore = 
    (damageScore * 0.35) + 
    (attendanceScore * 0.25) + 
    (equipmentScore * 0.20) + 
    (growthScore * 0.10) + 
    (specScore * 0.10);

  return Math.round(totalScore);
}
