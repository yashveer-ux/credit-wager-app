import postgres from 'postgres';

// Rates mirror lib/mock.ts in the mobile app so the two agree before the API exists.
const CREDIT_TYPES = [
  { code: 'SIM_CASH', display_name: 'Cash', rate: '1', spread_bps: 0 },
  { code: 'SIM_CHATGPT', display_name: 'GPT Credits', rate: '0.012', spread_bps: 500 },
  { code: 'SIM_ANTHROPIC', display_name: 'Claude Credits', rate: '0.015', spread_bps: 500 },
  { code: 'SIM_ELEVENLABS', display_name: 'ElevenLabs Credits', rate: '0.008', spread_bps: 750 },
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

console.log(`seeded ${CREDIT_TYPES.length} credit types`);
await sql.end();
