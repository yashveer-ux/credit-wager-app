/**
 * Endpoints for the server-authoritative online features.
 *
 * Env-driven so a build can point at any backend. The fallbacks are for the
 * simulator, which reaches the host machine's localhost directly. Never put a
 * production host here — set EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL instead.
 */

const trim = (url: string) => url.replace(/\/+$/, '');

export const API_URL = trim(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000');

export const WS_URL = trim(process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:3000/ws/blackjack');
