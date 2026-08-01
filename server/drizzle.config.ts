import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't read .env itself; node does, since 20.12.
try {
  process.loadEnvFile('.env');
} catch {}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
