# Node runs TypeScript directly via strip-only type stripping (unflagged from
# 23.6), so there is no build step — the source ships as-is. Keep this in sync
# with the syntax the code uses (no enums, no parameter properties).
FROM node:24-slim

WORKDIR /app

# Install deps against the lockfile first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Migrations are run as a separate step in deploy (npm run db:migrate), not at
# container start, so a crash-looping app can't half-apply a migration.
CMD ["node", "src/server.ts"]
