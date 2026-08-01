import { afterEach, describe, expect, it, jest } from '@jest/globals';

/** The module reads process.env at load, so each case re-requires it fresh. */
const load = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./config') as typeof import('./config');
};

const OLD_API = process.env.EXPO_PUBLIC_API_URL;
const OLD_WS = process.env.EXPO_PUBLIC_WS_URL;

afterEach(() => {
  process.env.EXPO_PUBLIC_API_URL = OLD_API;
  process.env.EXPO_PUBLIC_WS_URL = OLD_WS;
  if (OLD_API === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  if (OLD_WS === undefined) delete process.env.EXPO_PUBLIC_WS_URL;
});

describe('online config', () => {
  it('falls back to the simulator localhost URLs when env is unset', () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_WS_URL;
    const config = load();
    expect(config.API_URL).toBe('http://localhost:3000');
    expect(config.WS_URL).toBe('ws://localhost:3000/ws/blackjack');
  });

  it('uses the env URLs when set', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    process.env.EXPO_PUBLIC_WS_URL = 'wss://api.example.test/ws/blackjack';
    const config = load();
    expect(config.API_URL).toBe('https://api.example.test');
    expect(config.WS_URL).toBe('wss://api.example.test/ws/blackjack');
  });

  it('trims trailing slashes so path joins cannot double up', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test///';
    process.env.EXPO_PUBLIC_WS_URL = 'wss://api.example.test/ws/blackjack/';
    const config = load();
    expect(config.API_URL).toBe('https://api.example.test');
    expect(config.WS_URL).toBe('wss://api.example.test/ws/blackjack');
  });

  it('treats an empty env value as unset', () => {
    process.env.EXPO_PUBLIC_API_URL = '';
    const config = load();
    expect(config.API_URL).toBe('http://localhost:3000');
  });
});
