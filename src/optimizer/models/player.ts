export interface PlayerSkills {
  attack: number;
  precision: number;
  critChance: number;
  critDamage: number;
  armor: number;
  dodge: number;
  production: number;
  management: number;
  entrepreneurship: number;
}

export interface PlayerCompany {
  id: string;
  type: string;
  quality: number;
  workers: number;
  activeEngines: number;
  productionBonus: number;
}

export interface PlayerData {
  username: string;
  level: number;
  skills: PlayerSkills;
  companies: PlayerCompany[];
  countryBonus: number;
  resourceBonus: number;
  dailyHitsTarget: number; // How many hits they do per day
  budget: number; // Max they are willing to spend
}
