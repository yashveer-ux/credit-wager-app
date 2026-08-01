import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export const sql = postgres(url);
export const db = drizzle(sql, { schema });

export type Db = typeof db;

/**
 * A transaction handle. Every write that touches money must take one of these
 * rather than `db`, so callers cannot accidentally write outside a transaction.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export * from './schema.ts';
