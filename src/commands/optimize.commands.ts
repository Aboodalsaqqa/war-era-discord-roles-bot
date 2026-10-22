import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { fetchPlayerData } from '../optimizer/api/wareraClient';
import { fetchMarketSnapshot, fetchAvailableGear } from '../optimizer/api/marketClient';
import { generateGearCandidates } from '../optimizer/core/candidateGenerator';
import { simulateCombat } from '../optimizer/simulation/combatSimulator';
import { simulateEconomy } from '../optimizer/simulation/economySimulator';
import { scoreResult, OptimizationMode } from '../optimizer/core/scoring';
import { CommandTracer, safeDeferReply, safeEditReply } from '../utils/commandTracer';

export class OptimizeCommands {
  constructor() {}

  async handleOptimize(interaction: ChatInputCommandInteraction, correlationId?: string): Promise<void> {
    const tracer = new CommandTracer('optimize', correlationId);
    tracer.checkpoint(6, 'handler_start', { invokerId: interaction.user.id });

    const deferred = await safeDeferReply(interaction, tracer, { ephemeral: false });
    if (!deferred) return;

    const username = interaction.options.getString('username', true);
    const modeStr = interaction.options.getString('mode', true) as OptimizationMode;

    logger.info({ correlationId: tracer.correlationId, username, mode: modeStr }, 'Running build optimizer');

    try {
      tracer.checkpoint(9, 'work_start', { username, mode: modeStr });

      // 1. Fetch data
      const player = await fetchPlayerData(username);
      const market = await fetchMarketSnapshot();
      const availableGear = await fetchAvailableGear();

      // 2. Generate candidates
      const candidates = generateGearCandidates(player, market, availableGear);

      if (candidates.length === 0) {
        tracer.checkpoint(9, 'work_complete', { outcome: 'no_candidates' });
        await safeEditReply(interaction, tracer, {
          content: '❌ No valid gear combinations found within your budget or level requirements.',
        });
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
        tracer.checkpoint(9, 'work_complete', { outcome: 'no_optimal_build' });
        await safeEditReply(interaction, tracer, {
          content: '❌ Failed to find an optimal build.',
        });
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
        .setFooter({ text: 'Egypt Roles Bot • Developed by El-Gaiiar' })
        .setTimestamp();

      tracer.checkpoint(9, 'work_complete', { outcome: 'success', bestScore });
      await safeEditReply(interaction, tracer, { embeds: [embed] });

    } catch (error) {
      tracer.errorCheckpoint(9, 'work_error', error);
      logger.error({ correlationId: tracer.correlationId, error }, 'Error running optimizer command');
      await safeEditReply(interaction, tracer, {
        content: '❌ An error occurred while running the optimizer. Please try again later.',
      });
    }
  }
}
