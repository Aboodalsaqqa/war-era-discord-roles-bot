export const TIER_ORDER = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export const WAR_SKILLS = [
  'attack',
  'precision',
  'criticalChance',
  'criticalDamages',
  'armor',
  'dodge',
  'lootChance',
];

export const ECO_SKILLS = [
  'production',
  'management',
  'entrepreneurship',
  'companies',
];

export const SPECIALIZATION_THRESHOLD = 1.5;
export const MAX_API_REQUESTS_PER_MINUTE = 120;
export const CACHE_TTL_MS = 5 * 60 * 1000;
export const SNAPSHOT_RETENTION_DAYS = 90;

export const NAVIGATION_ITEMS = [
  { name: 'Dashboard', href: '/', icon: 'home' },
  { name: 'Members', href: '/members', icon: 'users' },
  { name: 'Performance', href: '/performance', icon: 'bar-chart' },
  { name: 'Military Unit', href: '/mu', icon: 'shield' },
  { name: 'Settings', href: '/settings', icon: 'settings' },
];

export const COLORS = {
  background: '#0a0e1a',
  accent: '#10b981',
  warning: '#f59e0b',
  alert: '#ef4444',
  highlight: '#06b6d4',
};
