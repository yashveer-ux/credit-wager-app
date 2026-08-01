import rateLimit from '@fastify/rate-limit';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AuthError, login, logout, refresh, register, verifyAccessToken } from './auth/index.ts';
import { ConvertError, convert } from './convert.ts';
import { creditTypes, db, transactions, wallets } from './db/index.ts';
import { parseAmount } from './money.ts';

/** AuthError/ConvertError codes the client caused, and the status each deserves. */
const STATUS: Record<string, number> = {
  INVALID_INPUT: 400,
  INVALID_AMOUNT: 400,
  SAME_CREDIT_TYPE: 400,
  AMOUNT_TOO_SMALL: 400,
  UNKNOWN_CREDIT_TYPE: 400,
  INSUFFICIENT_BALANCE: 409,
  NO_WALLET: 409,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  INVALID_TOKEN: 401,
  INVALID_REFRESH_TOKEN: 401,
  REFRESH_TOKEN_REUSED: 401,
};

const uuid = z.string().uuid();

/** A decimal amount string, parsed to minor units. Rejects floats and junk alike. */
const amount = z.string().transform((v, ctx) => {
  try {
    return parseAmount(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'not a valid amount' });
    return z.NEVER;
  }
});

const credentials = z.object({ email: z.string(), password: z.string() });
const registration = credentials.extend({ displayName: z.string() });
const refreshBody = z.object({ refreshToken: z.string().min(1) });
const convertBody = z.object({
  fromCreditTypeId: uuid,
  toCreditTypeId: uuid,
  amount,
});
const ledgerQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Cursor is "<iso timestamp>,<uuid>" — the sort key, so paging is stable
  // even when two rows share a timestamp.
  cursor: z.string().optional(),
});

/** Parses a body/query or throws the same shape the error handler maps to a 400. */
function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new AuthError('INVALID_INPUT');
  return result.data;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

/** Bearer-token gate. Routes opt in via `{ preHandler: requireAuth }`. */
async function requireAuth(request: FastifyRequest) {
  const header = request.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new AuthError('INVALID_TOKEN');
  request.userId = verifyAccessToken(header.slice(7)).sub;
}

export function buildApp({ logger = true } = {}): FastifyInstance {
  const app = Fastify({ logger });
  app.decorateRequest('userId', '');

  app.setErrorHandler((error, request, reply) => {
    const code = (error as AuthError | ConvertError).code;
    const status = typeof code === 'string' ? STATUS[code] : undefined;
    if (status) return reply.status(status).send({ error: code });

    // Anything unmapped is ours, not the caller's. Drizzle wraps driver errors,
    // so the useful message is usually on `cause`.
    const err = error as Error & { statusCode?: number };
    request.log.error({ err, cause: err.cause }, 'unhandled error');
    return reply.status(err.statusCode ?? 500).send({ error: 'INTERNAL_ERROR' });
  });

  app.get('/health', async () => ({ ok: true }));

  app.register(async (auth) => {
    // Credential endpoints are the ones worth throttling; the rest sit behind a
    // token already.
    await auth.register(rateLimit, { max: 10, timeWindow: '1 minute' });

    auth.post('/auth/register', (req) => register(parse(registration, req.body)));
    auth.post('/auth/login', (req) => login(parse(credentials, req.body)));
    auth.post('/auth/refresh', (req) => refresh(parse(refreshBody, req.body).refreshToken));
    auth.post('/auth/logout', async (req) => {
      await logout(parse(refreshBody, req.body).refreshToken);
      return { ok: true };
    });
  });

  app.get('/wallets', { preHandler: requireAuth }, async (req) => {
    const rows = await db
      .select({
        creditTypeId: wallets.creditTypeId,
        code: creditTypes.code,
        displayName: creditTypes.displayName,
        balance: wallets.balance,
        rate: creditTypes.simExchangeRateToCash,
      })
      .from(wallets)
      .innerJoin(creditTypes, eq(wallets.creditTypeId, creditTypes.id))
      .where(eq(wallets.userId, req.userId))
      .orderBy(creditTypes.code);
    return { wallets: rows };
  });

  app.post('/convert', { preHandler: requireAuth }, (req) =>
    convert({ userId: req.userId, ...parse(convertBody, req.body) }),
  );

  app.get('/transactions', { preHandler: requireAuth }, async (req) => {
    const { limit, cursor } = parse(ledgerQuery, req.query);

    let before;
    if (cursor) {
      const [ts, id] = cursor.split(',');
      const at = new Date(ts);
      if (Number.isNaN(at.getTime()) || !uuid.safeParse(id).success) {
        throw new AuthError('INVALID_INPUT');
      }
      before = or(
        lt(transactions.createdAt, at),
        and(eq(transactions.createdAt, at), lt(transactions.id, id)),
      );
    }

    // One extra row tells us whether another page exists without a count query.
    const rows = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, req.userId), before))
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      transactions: page,
      nextCursor:
        rows.length > limit && last ? `${last.createdAt.toISOString()},${last.id}` : null,
    };
  });

  return app;
}
