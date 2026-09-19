export interface RegimentDefinition {
  name: string;
  roleId: string;
  corpsName: string;
  unitRoleIds: string[];
}

export const REGIMENTS: RegimentDefinition[] = [
  // ANUBIS CORPS
  {
    name: 'Anubis 1st Regiment',
    roleId: '1550569383691288686',
    corpsName: 'ANUBIS CORPS',
    unitRoleIds: [
      '1490125587371528272', // EGY STRIKE
      '1499863803607908562', // EGY Black Knights
      '1454633296674951168', // EGY Soldiers Of Horus
      '1490125774727020594', // EGY War Eagles
    ],
  },
  {
    name: 'Anubis 2nd Regiment',
    roleId: '1550569510132777030',
    corpsName: 'ANUBIS CORPS',
    unitRoleIds: [
      '1500890663842222081', // EGY Kemet Core
      '1510376344494800957', // egy otaku war
      '1501172486837112852', // Sinai Guardians
      '1546021593367580773', // Apex Forces unit
      '1513499567746977893', // egy sharks
    ],
  },

  // KEMET CORPS
  {
    name: 'Kemet 1st Regiment',
    roleId: '1550569732854513795',
    corpsName: 'KEMET CORPS',
    unitRoleIds: [
      '1455696658200526930', // EG 3ASQLAN ARMY
      '1491370639796338711', // EGY SAKA FORCES
      '1499863799740629166', // Egy eagle eye
      '1484018468046114866', // Sheikhdom
    ],
  },
  {
    name: 'Kemet 2st Regiment',
    roleId: '1550569817021620246',
    corpsName: 'KEMET CORPS',
    unitRoleIds: [
      '1499863760922218527', // EGY 999
      '1491370410791403680', // EGY DMF
      '1499863815913738310', // EGY warriors de kemit
      '1546248078951194634', // Black Raven
      '1543642129560117408', // EGY Dune Raiders
    ],
  },

  // SUPPORT LEGION
  {
    name: 'Support legion',
    roleId: '1550571085697908796',
    corpsName: 'SUPPORT LEGION',
    unitRoleIds: [
      '1546251498864771154', // Black Knights Academy / EGY Black Knights 3
      '1522646904239030273', // EGY Academy 01
      '1531323100166357192', // EGY ACADEMY 02
      '1516744554626289674', // EGY Phoenix
      '1546248172328849479', // Black raven 2
    ],
  },
];

/**
 * All Regiment Role IDs managed by the bot
 */
export const ALL_REGIMENT_ROLE_IDS: string[] = REGIMENTS.map((r) => r.roleId);

/**
 * Evaluates which regiment roles a member qualifies for based on a unit-role check.
 * A member qualifies for a regiment role if they have ANY of the unit roles assigned to it.
 *
 * @param hasUnitRole Function returning true if member has the specified unit role ID
 * @returns Array of Regiment role IDs that the member should receive
 */
export function getQualifyingRegimentRoleIds(
  hasUnitRole: (unitRoleId: string) => boolean
): string[] {
  const qualifyingRoleIds: string[] = [];

  for (const regiment of REGIMENTS) {
    const hasAnyUnit = regiment.unitRoleIds.some((unitRoleId) => hasUnitRole(unitRoleId));
    if (hasAnyUnit) {
      qualifyingRoleIds.push(regiment.roleId);
    }
  }

  return qualifyingRoleIds;
}
