import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

/**
 * Secure headers + CORS. Call from app.ts: `await registerSecurity(app)`.
 * Auth itself lives in app.ts's requireAuth — this file only sets headers.
 *
 * ALLOWED_ORIGINS is a comma-separated allowlist. Unset means dev: reflect
 * whatever origin calls (native mobile apps send no Origin anyway; this only
 * matters for browser clients).
 */
export async function registerSecurity(app: FastifyInstance) {
  await app.register(helmet);

  const origins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  await app.register(cors, { origin: origins.length ? origins : true });
}
