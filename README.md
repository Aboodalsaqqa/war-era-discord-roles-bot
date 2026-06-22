# Egypt Discord Bot for WarEra

A production-ready Discord bot for the game **WarEra** built with Node.js, TypeScript, discord.js v14, Prisma ORM, and SQLite/PostgreSQL.

This bot automates Egypt citizen role management, presidency/congressional government roles sync, military unit (MU) tags, player specialization alignment (War, Economy, Hybrid), and provides an advanced **Military Recruitment & Operations System** for the Ministry of Defense (MoD).

---

## Key Features

1. **Role Synchronization**: Automatically detects Egypt nationality, level, MU ID, and dynamic specialization (War/Economy/Hybrid) calculated directly from player skills.
2. **Recruitment Campaigns**: Allow MoD officers to start/stop level-restricted mobilization campaigns, exempt/unexempt players, and generate detailed conversion reports showing progress by Military Unit.
3. **Daily Reminders**: Automatically DMs eligible non-War specialists reminding them to switch to War specialization (limited to one reminder per user per day).
4. **Operations alerts**: Create targeted Direct Message operations notifications (`war`, `economy`, `hybrid`, `level`, `mu`, `all`) with interactive button RSVPs (✅ Available / ❌ Unavailable).
5. **Readiness Dashboard**: Aggregated server overview detailing total verified counts, specialization distributions, level thresholds, campaign status, and average operation response statistics.

---

## Directory Structure
```
src/
  ├── config/          # Environment configuration loader
  ├── types/           # Type definitions (Responses.d.ts & warera-openapi.d.ts)
  ├── database/        # Prisma Client database connector
  ├── warera/          # tRPC API client and service wrappers
  ├── repositories/    # Database queries isolation (Prisma)
  ├── services/        # Business logic services (RoleSync, Verification, MoD)
  ├── commands/        # Discord slash commands router and implementation
  ├── jobs/            # Node-cron background sync and daily reminders loops
  ├── utils/           # Shared logger (pino) and utilities
  └── index.ts         # Application bootstrapper and process monitors
```

---

## Configuration (`.env`)
Create a `.env` file in the root folder (see `.env.example` as a template):
```env
DISCORD_TOKEN=MTUxN...                  # Discord Bot Token
DISCORD_CLIENT_ID=1516...               # Bot App Client ID
DATABASE_URL=file:./dev.db              # SQLite Database file path
WARERA_API_KEY=wae_fc85...              # WarEra API Key
WARERA_API_BASE_URL=https://api2.warera.io/trpc/
NODE_ENV=development
LOG_LEVEL=info
```

---

## Production Deployment (Render + Supabase PostgreSQL)

The bot is designed to be deployed as a **Background Worker** on Render.com, communicating with a Supabase PostgreSQL database.

### 1. Database Setup (Supabase)
1. Create a new Supabase project.
2. Get your connection string (ensure you use the transaction connection pooler port `6543` and `?pgbouncer=true`).

### 2. Deployment on Render
1. Push this repository to GitHub.
2. In Render, create a new **Background Worker** (do NOT choose Web Service, as this bot does not bind to an HTTP port).
3. Connect your GitHub repository.
4. Configure the following settings:
   * **Build Command**: `npm install && npx prisma generate && npm run build`
   * **Start Command**: `npx prisma db push --accept-data-loss && npm run start`
5. Configure the following Environment Variables in the Render dashboard:
   * `DATABASE_URL`: Your Supabase connection string.
   * `DISCORD_TOKEN`: Your Discord Bot token.
   * `DISCORD_CLIENT_ID`: Your Application Client ID.
   * `WARERA_API_KEY`: Your WarEra API Key.
   * `WARERA_API_BASE_URL`: `https://api2.warera.io/trpc/`
   * `NODE_ENV`: `production`

### 3. Startup Flow
During deployment, Render will build the TypeScript files. When the worker starts, `npx prisma db push` automatically synchronizes the PostgreSQL schema in Supabase before starting the bot.

---

## Command Reference (Slash Commands)

### Configuration Commands (Administrators)
* `/config citizen-role @Role` — Role given to members belonging to Egypt country.
* `/config officer-role @Role` — Role that grants MoD Officer privileges.
* `/config president-role @Role`, `/config vice-president-role @Role`, `/config congress-role @Role` — Cabinet mapping roles.
* `/config war-role @Role`, `/config economy-role @Role`, `/config hybrid-role @Role` — Specialization roles.
* `/mu-role add <muId> @Role` — Maps a WarEra MU to a Discord role (verifies existence via API first).
* `/mu-role remove <muId>` — Removes the MU mapping.
* `/mu-role list` — Lists configured MU roles.
* `/level-role add <minimumLevel> @Role` — Maps minimum level threshold to a role.
* `/level-role remove <minimumLevel>` — Removes level mapping.
* `/level-role list` — Lists configured levels.

### MoD Recruitment Commands (Officers & Administrators)
* `/recruitment start <title> <minimumLevel>` — Starts a level-restricted campaign. Deactivates existing active campaigns.
* `/recruitment stop` — Stops the active mobilization campaign.
* `/recruitment status` — Displays overview stats (eligible, converted, remaining).
* `/recruitment exempt <user>` — Prevents a player from receiving daily mobilization reminders.
* `/recruitment unexempt <user>` — Removes reminder exemption from a player.
* `/recruitment report` — Displays detailed conversion statistics including a breakdown of converted/eligible players grouped by their Military Unit (MU).

### MoD Operations Commands (Officers & Administrators)
* `/operation create <title> <message> <targetType> (muId) (minimumLevel)` — Creates and dispatches direct message alerts to matching players. Target types include: `war`, `economy`, `hybrid`, `level`, `mu`, and `all`.
* `/operation list` — Lists logged operations in the server along with their IDs.
* `/operation status <operationId>` — Displays statistics (dispatched count, Available/Unavailable RSVP button clicks count, and response rate).

### Readiness Dashboard (Officers & Administrators)
* `/readiness` — Displays detailed Egypt military readiness metrics.

### User Commands (All Users)
* `/verify <username>` — Links Discord ID to a WarEra profile. Displays a select menu if multiple player results are found.
* `/profile` — Displays a detailed player profile embed card.
* `/sync-me` — Forces a role refresh for yourself.
