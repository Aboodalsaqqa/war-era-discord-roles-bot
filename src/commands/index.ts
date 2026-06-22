import { ChatInputCommandInteraction, PermissionFlagsBits, ApplicationCommandOptionType } from 'discord.js';
import { UserCommands } from './user.commands';
import { AdminCommands } from './admin.commands';
import { ConfigCommands } from './config.commands';
import { RecruitmentCommands } from './recruitment.commands';
import { OperationCommands } from './operation.commands';
import { ReadinessCommands } from './readiness.commands';
import { VerificationManagementCommands } from './verificationManagement.commands';
import { logger } from '../utils/logger';

// Slash commands definition mapping
export const getSlashCommandsDefinition = () => [
  {
    name: 'verify',
    description: 'Link your Discord account to your WarEra profile',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'username',
        description: 'Your WarEra username',
        required: true,
      },
    ],
  },
  {
    name: 'profile',
    description: 'Display a linked WarEra player profile details',
    options: [
      {
        type: ApplicationCommandOptionType.User,
        name: 'member',
        description: 'The Discord member to view',
        required: false,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: 'username',
        description: 'Search by WarEra username',
        required: false,
      },
    ],
  },
  {
    name: 'sync-me',
    description: 'Manually refresh your own synchronized Discord roles',
  },
  {
    name: 'forceverify',
    description: 'Force link a Discord user to a WarEra profile (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.User,
        name: 'user',
        description: 'The Discord member to link',
        required: true,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: 'username',
        description: 'Their WarEra username',
        required: true,
      },
    ],
  },
  {
    name: 'unverify',
    description: 'Remove the linked connection of a Discord member (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.User,
        name: 'user',
        description: 'The Discord member to unlink',
        required: true,
      },
    ],
  },
  {
    name: 'sync',
    description: 'Synchronize roles for a specific Discord member (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.User,
        name: 'user',
        description: 'The Discord member to sync',
        required: true,
      },
    ],
  },
  {
    name: 'sync-all',
    description: 'Synchronize roles for all linked members in this guild (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: 'config',
    description: 'Configure bot role options for this guild (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'citizen-role',
        description: 'Set the Egypt Citizen role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for citizens',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'officer-role',
        description: 'Set the MoD Officer role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for MoD officers',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'president-role',
        description: 'Set the Country President role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for the president',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'vice-president-role',
        description: 'Set the Vice President role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for the vice president',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'congress-role',
        description: 'Set the Congress Member role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for congress members',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'war-role',
        description: 'Set the War Specialist role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for war specialists',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'economy-role',
        description: 'Set the Economy Specialist role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for economy specialists',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'hybrid-role',
        description: 'Set the Hybrid Specialist role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign for hybrids',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'trusted-role',
        description: 'Set the Trusted role for sync restriction and MoD systems',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role required for verified syncing',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'mu-commander-role',
        description: 'Set the MU Commander role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role for MU commanders',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'mu-owner-role',
        description: 'Set the MU Owner role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role for MU owners / founders',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'no-mu-role',
        description: 'Set the No MU Yet role',
        options: [
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign when player has no Military Unit',
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: 'mu-role',
    description: 'Configure Military Unit (MU) role mappings (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'add',
        description: 'Link a WarEra MU ID to a Discord role',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'mu-id',
            description: 'The WarEra MU ID (e.g. 684f8ab123456789)',
            required: true,
          },
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'remove',
        description: 'Remove role mapping for a WarEra MU ID',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'mu-id',
            description: 'The WarEra MU ID to remove mapping for',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'list',
        description: 'List all configured MU role mappings for this guild',
      },
    ],
  },
  {
    name: 'level-role',
    description: 'Configure Level role mappings (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'add',
        description: 'Map a minimum WarEra level to a Discord role',
        options: [
          {
            type: ApplicationCommandOptionType.Integer,
            name: 'minimum-level',
            description: 'The minimum level required',
            required: true,
          },
          {
            type: ApplicationCommandOptionType.Role,
            name: 'role',
            description: 'The Discord role to assign',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'remove',
        description: 'Remove role mapping for a minimum WarEra level',
        options: [
          {
            type: ApplicationCommandOptionType.Integer,
            name: 'minimum-level',
            description: 'The minimum level to remove mapping for',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'list',
        description: 'List all configured level role mappings for this guild',
      },
    ],
  },
  {
    name: 'recruitment',
    description: 'Ministry of Defense Recruitment Campaign dashboard (Officers only)',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'start',
        description: 'Start a new recruitment campaign in the guild',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'title',
            description: 'The title of the campaign directive',
            required: true,
          },
          {
            type: ApplicationCommandOptionType.Integer,
            name: 'minimum-level',
            description: 'Minimum level eligible for recruitment service',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'stop',
        description: 'Stop the active recruitment campaign',
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'status',
        description: 'Display stats for the active recruitment campaign',
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'exempt',
        description: 'Exempt a player from receiving daily mobilization reminders',
        options: [
          {
            type: ApplicationCommandOptionType.User,
            name: 'user',
            description: 'The Discord player to exempt',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'unexempt',
        description: 'Remove mobilization reminder exemption from a player',
        options: [
          {
            type: ApplicationCommandOptionType.User,
            name: 'user',
            description: 'The Discord player to remove exemption from',
            required: true,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'report',
        description: 'View a detailed mobilization conversion and MU report',
      },
    ],
  },
  {
    name: 'operation',
    description: 'Ministry of Defense Operations directives alert system (Officers only)',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'create',
        description: 'Create and dispatch a new operations directive DM alert',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'title',
            description: 'The title of the operation',
            required: true,
          },
          {
            type: ApplicationCommandOptionType.String,
            name: 'message',
            description: 'The directive message / objective details',
            required: true,
          },
          {
            type: ApplicationCommandOptionType.String,
            name: 'target-type',
            description: 'The target audience for this directive',
            required: true,
            choices: [
              { name: 'War Specialists', value: 'war' },
              { name: 'Economy Specialists', value: 'economy' },
              { name: 'Hybrid Players', value: 'hybrid' },
              { name: 'Level Threshold', value: 'level' },
              { name: 'Military Unit (MU)', value: 'mu' },
              { name: 'All Verified Players', value: 'all' },
            ],
          },
          {
            type: ApplicationCommandOptionType.String,
            name: 'mu-id',
            description: 'The MU ID (Required if target-type is MU)',
            required: false,
          },
          {
            type: ApplicationCommandOptionType.Integer,
            name: 'minimum-level',
            description: 'Minimum Level (Required if target-type is Level)',
            required: false,
          },
        ],
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'list',
        description: 'List all logged operations directives',
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'status',
        description: 'View availability statistics for a specific operation ID',
        options: [
          {
            type: ApplicationCommandOptionType.String,
            name: 'operation-id',
            description: 'The ID of the operation to query',
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: 'readiness',
    description: 'View the Egypt MoD Military Readiness Report Dashboard',
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  },
  {
    name: 'verified-list',
    description: 'View a paginated list of all verified users (MoD/Admin only)',
    options: [
      {
        type: ApplicationCommandOptionType.Boolean,
        name: 'trusted',
        description: 'Filter by trusted status (true/false)',
        required: false,
      },
    ],
  },
  {
    name: 'verified-export',
    description: 'Export all verified users to a CSV file (Admin only)',
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
];

export class CommandRouter {
  constructor(
    private readonly userCommands: UserCommands,
    private readonly adminCommands: AdminCommands,
    private readonly configCommands: ConfigCommands,
    private readonly recruitmentCommands: RecruitmentCommands,
    private readonly operationCommands: OperationCommands,
    private readonly readinessCommands: ReadinessCommands,
    private readonly verificationManagementCommands: VerificationManagementCommands
  ) {}

  async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction;
    logger.debug({ commandName, userId: interaction.user.id }, 'Routing slash command interaction');

    try {
      switch (commandName) {
        case 'verify':
          await this.userCommands.verify(interaction);
          break;
        case 'profile':
          await this.userCommands.profile(interaction);
          break;
        case 'sync-me':
          await this.userCommands.syncMe(interaction);
          break;
        case 'forceverify':
          await this.adminCommands.forceVerify(interaction);
          break;
        case 'unverify':
          await this.adminCommands.unVerify(interaction);
          break;
        case 'sync':
          await this.adminCommands.sync(interaction);
          break;
        case 'sync-all':
          await this.adminCommands.syncAll(interaction);
          break;
        case 'config':
          await this.configCommands.configureRoles(interaction);
          break;
        case 'mu-role':
          await this.configCommands.configureMuRoles(interaction);
          break;
        case 'level-role':
          await this.configCommands.configureLevelRoles(interaction);
          break;
        case 'recruitment':
          await this.recruitmentCommands.handleCommand(interaction);
          break;
        case 'operation':
          await this.operationCommands.handleCommand(interaction);
          break;
        case 'readiness':
          await this.readinessCommands.handleCommand(interaction);
          break;
        case 'verified-list':
          await this.verificationManagementCommands.handleListCommand(interaction);
          break;
        case 'verified-export':
          await this.verificationManagementCommands.handleExportCommand(interaction);
          break;
        default:
          logger.warn({ commandName }, 'Received unhandled command name');
          await interaction.reply({ content: '❌ Command not recognized.', ephemeral: true });
      }
    } catch (error) {
      logger.error({ error: (error as Error).message, commandName }, 'Error handling command interaction router');
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ An error occurred while executing this command.', ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ content: '❌ An error occurred while executing this command.', ephemeral: true }).catch(() => null);
      }
    }
  }
}
