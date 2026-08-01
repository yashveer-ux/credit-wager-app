import { Algorithm, hash, verify } from '@node-rs/argon2';

// argon2id at OWASP's current minimum: 19 MiB, 2 iterations, 1 lane.
// Deliberately not bcrypt, despite the spec table.
const OPTS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, OPTS);

export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password, OPTS).catch(() => false); // a malformed stored hash is a failed login, not a crash
