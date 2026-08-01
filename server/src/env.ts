/**
 * Environment validation. The server must fail fast at boot when a required
 * variable is missing, rather than 500ing on the first request that needs it.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  port: Number(optional('PORT', '3000')),
  host: optional('HOST', '0.0.0.0'),
  nodeEnv: optional('NODE_ENV', 'development'),
  logLevel: optional('LOG_LEVEL', 'info'),
  /** Comma-separated allowed CORS origins. Empty = reflect origin (dev only). */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimitMax: Number(optional('RATE_LIMIT_MAX', '10')),
  rateLimitWindow: optional('RATE_LIMIT_WINDOW', '1 minute'),
};

export const isProd = env.nodeEnv === 'production';
