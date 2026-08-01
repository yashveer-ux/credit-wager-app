<div align="center">

# 🪙 Credit Wager

**A premium casino-style prototype built on fictional AI-provider tokens.**
Five fully-playable games, a real backend with a database-enforced ledger, JWT auth, and live multiplayer — wrapped in a guest-first mobile app that never makes you sign in to play.

[![License: MIT](https://img.shields.io/badge/license-MIT-D9B45B.svg)](LICENSE)
![Expo SDK](https://img.shields.io/badge/Expo-SDK%2057-1B1F23?logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-17-4169E1?logo=postgresql&logoColor=white)

</div>

> ⚠️ **This is a fictional-currency demo.** "AI Tokens" have no real-world value. There are no real payments, no real payouts, no real withdrawals, and no connection to any real AI provider — Convert, Rewards, and Withdraw are all simulated for demonstration purposes only.

---

## Screenshots

<table>
<tr>
<td><img src="docs/screenshots/home.png" width="200" alt="Home screen"/></td>
<td><img src="docs/screenshots/play-lobby.png" width="200" alt="Play lobby"/></td>
<td><img src="docs/screenshots/blackjack.png" width="200" alt="Blackjack table"/></td>
<td><img src="docs/screenshots/rewards.png" width="200" alt="Rewards screen"/></td>
<td><img src="docs/screenshots/convert.png" width="200" alt="Convert screen"/></td>
</tr>
<tr>
<td align="center">Home</td>
<td align="center">Play lobby</td>
<td align="center">Blackjack</td>
<td align="center">Rewards</td>
<td align="center">Convert</td>
</tr>
</table>

---

## Contents

- [What this is](#what-this-is)
- [Feature tour](#feature-tour)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
  - [Mobile only (no backend needed)](#option-a--mobile-only-guest-mode)
  - [Full stack (backend + auth + multiplayer)](#option-b--full-stack-backend--auth--multiplayer)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Games & payout math](#games--payout-math)
- [API reference](#api-reference)
- [Security & data integrity](#security--data-integrity)
- [Known limitations](#known-limitations)
- [License](#license)

---

## What this is

Credit Wager is a mobile casino-lobby prototype for a fictional "AI token" economy — the pitch is that promo codes from AI companies (OpenAI, Anthropic, Google, Mistral, Hugging Face — all used here as fictional flavor, not real integrations) convert into a single spendable token, which you then wager across five original games.

It's built as two independent, honestly-labeled layers:

1. **A fully local, guest-first demo layer.** Install the app, land on Home, and every game, Reward, and Convert redemption works immediately — balance, history, and rewards all persist on-device (`AsyncStorage`), no account or network required.
2. **An optional real backend.** Sign in from the profile sheet and the same actions can be mirrored into a real Fastify + Postgres service with proper auth, a ledger with database-enforced integrity constraints, and **live multiplayer Blackjack** over WebSockets against other real accounts.

Nothing here touches real money. See the disclaimer at the top.

## Feature tour

### 🎰 Five original games (`app/play/*`)

| Game | Hook |
|---|---|
| **Blackjack** | Classic vs. an AI dealer — hit, stand, double down, full dealer draw-to-17 logic, a real felt table with hand totals and a card-flip reveal. |
| **Roulette** | Single-zero European wheel — straight numbers, red/black, odd/even, high/low, dozens, with an animated wheel that lands exactly on the drawn pocket. |
| **Neural Crash** | A rising multiplier "fed by an unstable model" — cash out before it crashes, house-edge-aware crash-point generation, a from-scratch neural-network visual (no stock chart in sight). |
| **Six Chambers** | Open digital chambers one at a time; each safe pick raises your multiplier, one chamber is live. Bank anytime. |
| **Turing Bet** | Decide whether each short passage was written by a human or an AI. Streak correct answers up a 10-step multiplier ladder; one miss ends the run. |

Every game shares the same wagering rules: bets can't be zero or exceed your balance, wagers deduct exactly once, payouts land exactly once (ref-guarded against double-taps), and every settled round writes a single entry to the unified transaction ledger.

### 🌐 Online multiplayer Blackjack (`app/play/online-blackjack.tsx`, `app/play/table/[id].tsx`)

Real accounts only. Quick-match into an open table, create a public or private table (with a join code), ready up, and play a genuine multi-seat round — turn deadlines with countdowns, reconnect handling, and settlement against each player's own server wallet. This isn't a stub: it's backed by an idempotent command protocol (every action carries a `commandId`) and a WebSocket layer that backfills missed events before subscribing live, so a dropped connection can never create a gap.

### 🎁 Rewards (`app/(tabs)/rewards.tsx`)

Level + XP progress, a 7-day check-in strip, daily missions, weekly challenges, achievements, milestone rewards, and cosmetic unlocks (avatar frames, accents) — all four claim states (claimable / claimed / in-progress / locked) implemented, and every token reward is credited through the same unified ledger so it shows up in your history.

### 🔁 Convert — promo code redemption (`app/(tabs)/convert.tsx`)

A polished voucher-redemption flow: pick the AI provider that "issued" your code, enter or paste it, and redeem. Codes are case-insensitive, single-use, provider-locked, and can be expired — all six states (loading / success / invalid / expired / already-used / wrong-provider) have distinct feedback. No real provider APIs are touched.

### 💳 Withdraw (`app/withdraw.tsx`)

A demo withdrawal flow deliberately built to *look* production-real — amount entry with validation, three mock payout methods with fees and ETAs, a fee-summary card, a processing state, and a receipt screen with a reference ID and status timeline. A persistent banner and every confirmation make clear it's fictional; there are no credential fields anywhere in the flow.

### 👤 Profile — the only place auth lives

The app never gates you behind a login screen. Tap the avatar on Home to open the profile sheet: as a guest you get a "Log in or create an account" callout; signed in, you get your real name/email, live stats (games played, win rate), a full filterable transaction history (games / promo / rewards / withdrawals), and a real sign-out.

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│        Mobile app           │        │            Server             │
│  Expo Router + React Native │        │      Fastify + Drizzle        │
│                              │        │                                │
│  Local demo layer            │        │  ┌──────────────────────────┐ │
│  • AsyncStorage balance/     │◄──────►│  │ Postgres 17               │ │
│    history/redemptions/      │  REST  │  │ • wallets & ledger        │ │
│    rewards (works offline,   │  JSON  │  │   (DB-enforced integrity) │ │
│    no account needed)         │        │  │ • refresh-token rotation │ │
│                              │        │  │ • multiplayer blackjack  │ │
│  Optional real-account layer │  WS    │  │   tables & rounds         │ │
│  • lib/auth.tsx (session)    │◄──────►│  └──────────────────────────┘ │
│  • lib/api.ts (REST client)  │        │                                │
│  • lib/online/* (multiplayer)│        │                                │
└─────────────────────────────┘        └──────────────────────────────┘
```

The two layers are intentionally decoupled: every screen works with the local layer alone, and signing in only *adds* server-backed capability (multiplayer, cross-device history) rather than being required for anything.

## Tech stack

**Mobile**
- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) · React Native 0.86 · React 19
- [Expo Router](https://docs.expo.dev/router/introduction/) (file-based navigation, typed routes)
- TypeScript, strict mode
- `@react-native-async-storage/async-storage`, `expo-secure-store`, `expo-haptics`, `expo-clipboard`
- Jest (`jest-expo` preset) for unit tests

**Backend** (`server/`)
- [Fastify 5](https://fastify.dev/) with `@fastify/websocket`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`
- [Drizzle ORM](https://orm.drizzle.team/) over `postgres` (Postgres 17)
- `@node-rs/argon2` (argon2id password hashing), hand-rolled HS256 JWT access tokens + rotating refresh tokens
- Zod for request validation
- Vitest for tests, Docker Compose for local Postgres

## Project structure

```
app/
  (tabs)/            Home, Convert, Play lobby, Rewards, hidden History tab
  play/               The five games + online-blackjack lobby + table/[id]
  login.tsx           Sign-in / register — pushed from the profile sheet only
  withdraw.tsx        Demo withdrawal flow
  _layout.tsx         Root stack — always opens guest-first, no auth gate

components/
  play/               Shared game UI: buttons, wager bar, result modal, cards
  home/               Home header, game icons, featured challenges
  rewards/            Rewards screen building blocks
  convert/            Provider picker, code input, result banners
  withdraw/           Withdrawal flow building blocks
  profile/            Avatar button, profile sheet, history panel

lib/
  play/               Game engines, payout math, balance/history stores
  rewards/            Rewards mock data + local claim state
  convert/            Demo promo-code config + redemption store
  ledger/             Unified transaction ledger (games + rewards + promo + withdrawals)
  online/             Multiplayer client (REST + WebSocket)
  auth.tsx, api.ts     Session state + typed REST client for the real backend
  theme.ts             Casino-green + champagne-gold design tokens

server/
  src/auth/            Password hashing, JWT + refresh-token rotation
  src/blackjack/        Multiplayer engine, round state machine, realtime layer
  src/db/               Drizzle schema + migrations (ledger-integrity constraints)
  src/{games,convert,promo,rewards,profile,ledger,money}.ts
  tests/                Vitest suites (business logic + HTTP integration)
```

## Getting started

### Prerequisites

- Node.js 20+ for the mobile app; **Node 23.6+** for the server (it uses native TypeScript execution — see note below)
- [Expo Go](https://expo.dev/go) on a physical device, or Xcode/Android Studio for a simulator
- Docker (only needed if you want the real backend)

### Option A — Mobile only (guest mode)

The fastest path — every game, Rewards, and Convert work fully offline with a local demo balance:

```bash
npm install
npm start          # then press i / a / w, or scan the QR with Expo Go
```

### Option B — Full stack (backend + auth + multiplayer)

1. **Start Postgres:**
   ```bash
   cd server
   docker compose up -d --wait
   ```
2. **Configure the server:**
   ```bash
   cp .env.example .env
   # then set JWT_SECRET, e.g.:
   echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
   ```
3. **Migrate + seed** (`db:migrate` uses `drizzle-kit`'s own runtime, so it works on any Node; `db:seed` executes a `.ts` file directly and needs Node ≥ 23.6's native TypeScript support — on an older Node, swap in `npx tsx src/db/seed.ts`):
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed          # or: npx tsx src/db/seed.ts
   ```
4. **Run the API** (same Node ≥ 23.6 caveat as seeding — `dev`/`start` also run a `.ts` file directly via Node; use `npx tsx src/server.ts` on an older Node):
   ```bash
   npm run dev         # http://localhost:3000
   ```
5. **Run the mobile app** in another terminal (from the repo root):
   ```bash
   npm start
   ```
   The client defaults to `http://localhost:3000` / `ws://localhost:3000/ws/blackjack`, which the iOS Simulator and Android emulator both reach out of the box. On a physical device, set `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` to your machine's LAN address.
6. Open the app, tap the avatar on Home → **Create an account**, and you now have a real backend session. Grant yourself demo tokens with `POST /faucet` (or via `Play → Online → Rewards`) to try Online Blackjack.

## Environment variables

**`server/.env`** (see `server/.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | e.g. `postgres://wager:wager@localhost:5432/credit_wager` — matches `docker-compose.yml` by default |
| `JWT_SECRET` | ✅ | No default — the server refuses to boot without one. Generate with `openssl rand -base64 48` |

**Mobile** (optional, only to point at a non-default backend)

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` | REST base URL |
| `EXPO_PUBLIC_WS_URL` | `ws://localhost:3000/ws/blackjack` | Multiplayer Blackjack socket |

Neither is required to use the app in guest mode — they only matter once you sign in.

## Testing

```bash
# Mobile (Jest) — 123 tests across 12 suites
npm test

# Server (Vitest) — 135 tests across 11 suites; DB-backed suites need Postgres running
cd server && npm test
```

**258 tests, 0 failures** as of this writing — payout formulas, blackjack/roulette engines, crash-curve math, promo-code validation, and the full REST/auth/ledger/multiplayer surface on the server side, including transactional ledger-integrity checks against a real Postgres instance.

## Games & payout math

All formulas live in [`lib/play/payouts.ts`](lib/play/payouts.ts) and are unit-tested exactly to these values.

| Game | Payout | Formula |
|---|---|---|
| Blackjack | Win 2× · Blackjack 2.5× · Push returns wager · Loss 0 | fixed multipliers |
| Roulette | Straight 36× · Red/Black/Odd/Even/Low/High 2× · Dozens 3× | fixed multipliers |
| Neural Crash | `wager × cash-out multiplier` | `crash = min(50, floor(0.96 / (1 - r) × 100) / 100)`, ~4% house edge |
| Six Chambers | `wager × multiplier(n)` for `n` safe picks | `multiplier(n) = 0.96 × 6 / (6 - n)` → 1.15×, 1.44×, 1.92×, 2.88×, 5.76× |
| Turing Bet | `wager × multiplier(streak)` | ladder: `1.15, 1.32, 1.55, 1.85, 2.25, 2.80, 3.60, 4.80, 6.70, 10.00` |

Demo starting balance: **5,000 AI Tokens** (`STARTING_BALANCE` in `lib/play/balanceStore.ts`); the server-side faucet grants the same 5,000 by default, capped at 50,000 per call.

## API reference

Base URL defaults to `http://localhost:3000`. Every route below except `/health`, `/ready`, and `/auth/*` requires `Authorization: Bearer <accessToken>`.

| Method & path | Purpose |
|---|---|
| `POST /auth/register` · `/auth/login` | Create a session — returns `{ user, accessToken, refreshToken }` |
| `POST /auth/refresh` · `/auth/logout` | Rotate or revoke a refresh-token family |
| `GET /me` | Current profile |
| `GET /wallets` | Balances across all credit types |
| `POST /convert` | Convert between credit types |
| `POST /faucet` | Demo token grant (capped) |
| `POST /promo/redeem` | Redeem a promo code server-side |
| `GET /rewards` · `POST /rewards/:code/claim` | Server-tracked reward list & claiming |
| `GET /transactions` | Ledger history |
| `POST /games/:code/wager` · `/games/rounds/:roundId/settle` | Generic single-player round accounting |
| `GET /blackjack/tables` · `POST /blackjack/quickmatch` · `POST /blackjack/join` | Multiplayer lobby |
| `POST /blackjack/tables/:id/{ready,start,bet,action,leave}` | In-round multiplayer commands (idempotent via `commandId`) |
| `GET /ws/blackjack` | WebSocket — real-time table events, Bearer-authenticated on upgrade |

Full auth/session semantics, including refresh-token theft detection, are documented in [`server/docs/AUTH_FLOW.md`](server/docs/AUTH_FLOW.md).

## Security & data integrity

- **Passwords:** argon2id via `@node-rs/argon2`.
- **Tokens:** 15-minute HS256 access tokens (never persisted server-side) + 30-day single-use refresh tokens, one family per login. Reusing an already-consumed refresh token revokes the *entire* family — theft of a stolen token kills both sessions rather than silently succeeding.
- **Ledger integrity:** enforced in Postgres itself via triggers (`0001_ledger_integrity.sql`), not just in application code — the `transactions` table is append-only (`UPDATE`/`DELETE` raise), `balance_after` is stamped server-side from a row-locked read (never trusted from the client), and only the ledger's own trigger is allowed to move a wallet's cached balance. Balances structurally cannot drift from their transaction history, even under concurrent writes.
- **Multiplayer commands** are idempotent (`commandId` per action) and locked per-table, so a retried network request can't double-charge a wager or double-apply an action.
- **WebSocket auth** uses the same Bearer access token as REST, verified on the upgrade request — no separate ticket system, no query-string tokens (which would leak into access logs).

## Known limitations

- The server's `dev`/`start`/`db:seed` scripts rely on Node's native TypeScript execution (`engines: node >= 23.6`). On an older Node, run the underlying file through `npx tsx` instead (e.g. `npx tsx src/server.ts`) — migrations (`drizzle-kit`) and tests (`vitest`) are unaffected and run fine on Node 20.
- Turing Bet's content bank is text-only; there are no bundled image assets for an "AI or real photo" round variant.
- Rewards/mission progress in the local demo layer resets on app reload by design (no persistence beyond the session); redeemed promo codes and the ledger do persist.
- This is a portfolio/prototype project — there is no production deployment, and the fictional economy is intentionally disconnected from any real payment or AI-provider system.

## License

[MIT](LICENSE) © Yashveer Sookun
