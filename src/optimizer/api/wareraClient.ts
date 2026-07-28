import { PlayerData } from '../models/player';

const API_HOSTS = [
  'https://api2.warera.io',
  'https://api3.warera.io',
  'https://api4.warera.io',
  'https://api6.warera.io'
];

export async function fetchPlayerData(username: string): Promise<PlayerData> {
  // In a real implementation, this would fetch from the WarEra tRPC API
  // For the purpose of this clean-room implementation, we'll return mock data
  // or a template that can be filled in with actual tRPC calls.
  
  // Example of how the request might look:
  // const host = API_HOSTS[0]; // Or round-robin
  // const response = await fetch(`${host}/trpc/player.getProfile?input=${encodeURIComponent(JSON.stringify({ username }))}`);
  // const data = await response.json();
  // return mapToPlayerData(data);

  return {
    username,
    level: 40,
    skills: {
      attack: 100,
      precision: 80,
      critChance: 50,
      critDamage: 40,
      armor: 20,
      dodge: 20,
      production: 120,
      management: 30,
      entrepreneurship: 25
    },
    companies: [
      {
        id: 'c1',
        type: 'food',
        quality: 5,
        workers: 10,
        activeEngines: 1,
        productionBonus: 0.1
      }
    ],
    countryBonus: 0.2,
    resourceBonus: 0,
    dailyHitsTarget: 500,
    budget: 1000000
  };
}
