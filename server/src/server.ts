import { buildApp } from './app.ts';
import { sql } from './db/index.ts';
import { env } from './env.ts';

const app = await buildApp({ logger: true });

await app.listen({ port: env.port, host: env.host });

// Graceful shutdown: stop accepting connections, drain in-flight requests, then
// close the DB pool. Without this a container SIGTERM drops live requests.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      await sql.end({ timeout: 5 });
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  });
}
