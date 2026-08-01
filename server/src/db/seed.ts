import postgres from 'postgres';

// Rates mirror lib/mock.ts in the mobile app so the two agree before the API exists.
const CREDIT_TYPES = [
  { code: 'SIM_CASH', display_name: 'Cash', rate: '1', spread_bps: 0 },
  { code: 'SIM_CHATGPT', display_name: 'GPT Credits', rate: '0.012', spread_bps: 500 },
  { code: 'SIM_ANTHROPIC', display_name: 'Claude Credits', rate: '0.015', spread_bps: 500 },
  { code: 'SIM_ELEVENLABS', display_name: 'ElevenLabs Credits', rate: '0.008', spread_bps: 750 },
  // What the Play games wager in. Rate is arbitrary until Convert trades it.
  { code: 'SIM_AI_TOKEN', display_name: 'AI Credits', rate: '0.01', spread_bps: 500 },
];

/**
 * Mirrors GAMES in the app's lib/play/games.ts. house_edge_pct is descriptive
 * only — the client computes payouts, so nothing here enforces it.
 */
const GAMES = [
  { code: 'blackjack', name: 'Blackjack', edge: '0.5000', min: '10', max: '5000' },
  { code: 'roulette', name: 'Roulette', edge: '2.7000', min: '5', max: '5000' },
  { code: 'crash', name: 'Neural Crash', edge: '3.0000', min: '5', max: '5000' },
  { code: 'chambers', name: 'Six Chambers', edge: '4.0000', min: '10', max: '5000' },
  { code: 'human-or-ai', name: 'Human or AI', edge: '3.5000', min: '10', max: '5000' },
];

const sql = postgres(process.env.DATABASE_URL!);

for (const t of CREDIT_TYPES) {
  await sql`
    INSERT INTO credit_types (code, display_name, sim_exchange_rate_to_cash, spread_bps)
    VALUES (${t.code}, ${t.display_name}, ${t.rate}, ${t.spread_bps})
    ON CONFLICT (code) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      sim_exchange_rate_to_cash = EXCLUDED.sim_exchange_rate_to_cash,
      spread_bps = EXCLUDED.spread_bps
  `;
}

for (const g of GAMES) {
  await sql`
    INSERT INTO games (code, name, house_edge_pct, min_wager, max_wager)
    VALUES (${g.code}, ${g.name}, ${g.edge}, ${g.min}, ${g.max})
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      house_edge_pct = EXCLUDED.house_edge_pct,
      min_wager = EXCLUDED.min_wager,
      max_wager = EXCLUDED.max_wager
  `;
}

// Existing users predate SIM_AI_TOKEN and would have no wallet for it, which
// makes every ledger insert raise. Opening the missing ones is idempotent.
const [{ count }] = await sql`
  INSERT INTO wallets (user_id, credit_type_id)
  SELECT u.id, c.id FROM users u CROSS JOIN credit_types c
  ON CONFLICT (user_id, credit_type_id) DO NOTHING
  RETURNING 1
`.then((rows) => [{ count: rows.length }]);

console.log(
  `seeded ${CREDIT_TYPES.length} credit types, ${GAMES.length} games, ${count} missing wallets`,
);
await sql.end();
