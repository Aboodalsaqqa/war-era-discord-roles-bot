import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { fetchPlayerData } from '../optimizer/api/wareraClient';
import { fetchMarketSnapshot, fetchAvailableGear } from '../optimizer/api/marketClient';
import { generateGearCandidates } from '../optimizer/core/candidateGenerator';
import { simulateCombat } from '../optimizer/simulation/combatSimulator';
import { simulateEconomy } from '../optimizer/simulation/economySimulator';
import { scoreResult, OptimizationMode } from '../optimizer/core/scoring';

export class OptimizeCommands {
  constructor() {}

  async handleOptimize(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const username = interaction.options.getString('username', true);
    const modeStr = interaction.options.getString('mode', true) as OptimizationMode;

    logger.info({ username, mode: modeStr }, 'Running build optimizer');

    try {
      // 1. Fetch data
      const player = await fetchPlayerData(username);
      const market = await fetchMarketSnapshot();
      const availableGear = await fetchAvailableGear();

      // 2. Generate candidates
      const candidates = generateGearCandidates(player, market, availableGear);

      if (candidates.length === 0) {
        await interaction.editReply('❌ No valid gear combinations found within your budget or level requirements.');
        return;
      }

      // 3. Simulate and Score
      let bestScore = -Infinity;
      let bestBuild: any = null;
      
      const economy = simulateEconomy(player, market);
      const combatResult: any = {};

      for (const gearSet of candidates) {
        simulateCombat(player, gearSet, market, combatResult);
        const netProfit = economy.companyProfit + combatResult.combatProfit;
        
        const result = { combat: { ...combatResult }, economy, netProfit };
        const score = scoreResult(result, modeStr);

        if (score > bestScore) {
          bestScore = score;
          bestBuild = { gearSet, result, score };
        }
      }

      if (!bestBuild) {
        await interaction.editReply('❌ Failed to find an optimal build.');
        return;
      }

      // 4. Render result
      const embed = new EmbedBuilder()
        .setTitle(`🛠️ Optimal Build for ${username}`)
        .setDescription(`Optimized for **${modeStr}** mode. Tested ${candidates.length} combinations.`)
        .setColor('#00ff00')
        .addFields(
          { name: '⚔️ Expected Damage', value: bestBuild.result.combat.damage.toLocaleString(), inline: true },
          { name: '💰 Daily Net Profit', value: `$${bestBuild.result.netProfit.toLocaleString()}`, inline: true },
          { name: '🔧 Repair Cost', value: `$${bestBuild.result.combat.repairCost.toLocaleString()}`, inline: true },
          { name: 'Gear Setup', value: bestBuild.gearSet.map((g: any) => `- **${g.slot}**: ${g.tier} (Id: ${g.id})`).join('\n') }
        )
        .setFooter({ text: 'WarEra Build Optimizer' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error({ error }, 'Error running optimizer command');
      await interaction.editReply('❌ An error occurred while running the optimizer. Please try again later.');
    }
  }
}
