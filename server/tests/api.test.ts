import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.DATABASE_URL;

// No database in CI? Skip rather than fail.
describe.skipIf(!url)('http api', async () => {
  const { buildApp } = await import('../src/app.ts');
  const sql = postgres(url!);
  const app = buildApp({ logger: false });

  const email = `api-test-${Date.now()}@example.test`;
  const password = 'correct horse battery';
  let accessToken: string;
  let refreshToken: string;
  let userId: string;
  let cashId: string;
  let gptId: string;

  const auth = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});

  const post = async (path: string, body: Record<string, unknown>, token?: string) =>
    await app.inject({ method: 'POST', url: path, payload: body, headers: auth(token) });

  const get = async (path: string, token?: string) =>
    await app.inject({ method: 'GET', url: path, headers: auth(token) });

  beforeAll(async () => {
    await app.ready();
    const rows = await sql`SELECT id, code FROM credit_types WHERE code IN ('SIM_CASH', 'SIM_CHATGPT')`;
    cashId = rows.find((r) => r.code === 'SIM_CASH')!.id;
    gptId = rows.find((r) => r.code === 'SIM_CHATGPT')!.id;
  });

  afterAll(async () => {
    await app.close();
    await sql.end();
  });

  it('registers a user and returns a session', async () => {
    const res = await post('/auth/register', { email, password, displayName: 'API Test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe(email);
    accessToken = body.accessToken;
    refreshToken = body.refreshToken;
    userId = body.user.id;
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await post('/auth/register', { email, password, displayName: 'Dupe' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('EMAIL_TAKEN');
  });

  it('rejects a bad password with 401 and no hint that the account exists', async () => {
    const wrong = await post('/auth/login', { email, password: 'wrong password here' });
    const unknown = await post('/auth/login', { email: 'nobody@example.test', password });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('rejects malformed registration input with 400', async () => {
    const res = await post('/auth/register', { email: 'not-an-email', password, displayName: 'x' });
    expect(res.statusCode).toBe(400);
  });

  it('refuses /wallets without a token', async () => {
    expect((await get('/wallets')).statusCode).toBe(401);
  });

  it('refuses /wallets with a forged token', async () => {
    expect((await get('/wallets', `${accessToken}tampered`)).statusCode).toBe(401);
  });

  it('opens a zero wallet per credit type at registration', async () => {
    const res = await get('/wallets', accessToken);
    expect(res.statusCode).toBe(200);
    const { wallets } = res.json();
    expect(wallets.length).toBeGreaterThanOrEqual(4);
    expect(wallets.every((w: { balance: string }) => Number(w.balance) === 0)).toBe(true);
  });

  it('rejects a convert with no balance as 409, not 500', async () => {
    const res = await post(
      '/convert',
      { fromCreditTypeId: cashId, toCreditTypeId: gptId, amount: '100.0000' },
      accessToken,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('INSUFFICIENT_BALANCE');
  });

  // The regression this route layer exists to prevent: a malformed UUID used to
  // reach Postgres and come back as a wrapped driver error, i.e. a 500.
  it('rejects a malformed credit type id with 400, not 500', async () => {
    const res = await post(
      '/convert',
      { fromCreditTypeId: 'not-a-uuid', toCreditTypeId: gptId, amount: '1.0000' },
      accessToken,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-numeric amount with 400', async () => {
    const res = await post(
      '/convert',
      { fromCreditTypeId: cashId, toCreditTypeId: gptId, amount: '10; DROP TABLE users' },
      accessToken,
    );
    expect(res.statusCode).toBe(400);
  });

  it('converts and moves both balances', async () => {
    // Fund the wallet through the ledger, the only way a balance may move.
    await sql`
      INSERT INTO transactions (user_id, type, credit_type_id, amount, balance_after)
      VALUES (${userId}, 'ADJUSTMENT', ${cashId}, '1000.0000', '0')
    `;

    const res = await post(
      '/convert',
      { fromCreditTypeId: cashId, toCreditTypeId: gptId, amount: '100.0000' },
      accessToken,
    );
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.from.balance).toBe('900.0000');
    expect(Number(body.to.balance)).toBeGreaterThan(0);

    const { wallets } = (await get('/wallets', accessToken)).json();
    const gpt = wallets.find((w: { code: string }) => w.code === 'SIM_CHATGPT');
    expect(gpt.balance).toBe(body.to.balance);
  });

  it('lists the ledger newest first and pages with a cursor', async () => {
    const first = await get('/transactions?limit=2', accessToken);
    expect(first.statusCode).toBe(200);

    const page = first.json();
    expect(page.transactions).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();

    const second = await get(
      `/transactions?limit=2&cursor=${encodeURIComponent(page.nextCursor)}`,
      accessToken,
    );
    const ids = new Set(page.transactions.map((t: { id: string }) => t.id));
    // A second page must not repeat the first.
    for (const t of second.json().transactions) expect(ids.has(t.id)).toBe(false);
  });

  it('rejects a malformed ledger cursor with 400', async () => {
    expect((await get('/transactions?cursor=garbage', accessToken)).statusCode).toBe(400);
  });

  it('rotates the refresh token and kills the old one', async () => {
    const rotated = await post('/auth/refresh', { refreshToken });
    expect(rotated.statusCode).toBe(200);
    const next = rotated.json().refreshToken;
    expect(next).not.toBe(refreshToken);

    // Reusing the consumed token is theft: rejected, and it takes the family down.
    expect((await post('/auth/refresh', { refreshToken })).statusCode).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: next })).statusCode).toBe(401);
  });

  it('serves health without a token', async () => {
    const res = await get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
