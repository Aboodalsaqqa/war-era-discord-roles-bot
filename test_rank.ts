import { WarEraClient } from './src/warera/client';

async function test() {
  const client = new WarEraClient();
  console.log('Fetching ranking...');
  const ranking = await client.request('ranking.getRanking', { rankingType: 'userDamages' });
  console.log(`Received ${ranking.items?.length || 0} ranking items.`);
  
  if (ranking.items && ranking.items.length > 0) {
    console.log(ranking.items[0]);
  }

  console.log('Fetching owned MUs...');
  const mus = await client.request('mu.getManyPaginated', { userId: '69b3e9792895f070b7813ce1', limit: 100 });
  console.log(`Received ${mus.items?.length || 0} owned MUs.`);
}

test().catch(console.error);
