import { OptimizationMode } from './scoring';

export interface Preset {
  id: string;
  name: string;
  description: string;
  mode: OptimizationMode;
  requirePositiveProfit?: boolean;
}

export const PRESETS: Preset[] = [
  {
    id: 'preset-max-dmg',
    name: 'Maximum Damage',
    description: 'Finds the build with the absolute highest damage, ignoring all repair and daily costs.',
    mode: 'maxDamage'
  },
  {
    id: 'preset-sustainable',
    name: 'Sustainable Daily',
    description: 'Maximizes damage while avoiding gear that puts you in a negative daily cash flow.',
    mode: 'sustainable',
    requirePositiveProfit: true
  },
  {
    id: 'preset-war-eco',
    name: 'War/Economy Balance',
    description: 'Finds a balanced setup that yields high damage and high profit.',
    mode: 'warEco'
  },
  {
    id: 'preset-pure-profit',
    name: 'Pure Profit',
    description: 'Ignores damage entirely and finds the gear with the absolute lowest repair/running costs relative to rewards.',
    mode: 'profit'
  }
];
