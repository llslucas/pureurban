import { Effect, Clock } from 'effect';
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag.js';
import { noEvents } from '../../core/events/index.js';

export const healthCheckProgram = Effect.gen(function* () {
  const prisma = yield* PrismaServiceTag;
  const queryResult = yield* Effect.tryPromise({
    try: () => prisma.$queryRaw`SELECT 1 as health`,
    catch: (error) =>
      new Error(
        `Database health check query failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      ),
  });
  const isHealthy = Array.isArray(queryResult) && queryResult.length > 0;
  const now = yield* Clock.currentTimeMillis;
  const timestamp = new Date(now).toISOString();
  return noEvents({
    status: isHealthy ? 'ok' : 'degraded',
    database: isHealthy ? 'connected' : 'unhealthy',
    timestamp,
  });
});
