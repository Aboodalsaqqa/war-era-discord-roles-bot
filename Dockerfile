# --- Build Stage ---
FROM node:22-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependency files
COPY package*.json tsconfig.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies)
RUN npm ci

# Copy source code files
COPY src ./src/

# Compile TypeScript and generate Prisma Client
RUN npm run build
RUN npx prisma generate

# --- Runner Stage ---
FROM node:22-alpine AS runner

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy production package files
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled source and Prisma client from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Environment configurations
ENV NODE_ENV=production

# Command to run database migrations and start the bot
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
