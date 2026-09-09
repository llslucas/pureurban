import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReminderSchedulerService } from './reminder-scheduler.service.js';
import type { BoardingService } from './boarding.service.js';

// Fake timers over a plain shell setInterval: a tick triggers the
// BoardingService scan, destroy clears the interval — no @nestjs/schedule and
// no real clock (same pattern as the boarding-events heartbeat specs).
describe('ReminderSchedulerService', () => {
  const makeService = (scan: () => Promise<unknown>) =>
    new ReminderSchedulerService({
      runReminderScan: scan,
    } as unknown as BoardingService);

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('60s tick triggers the BoardingService scan', async () => {
    const scan = vi.fn().mockResolvedValue(undefined);
    const service = makeService(scan);

    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(scan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(scan).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });

  it('onModuleDestroy clears the interval: no scan after destroy', async () => {
    const scan = vi.fn().mockResolvedValue(undefined);
    const service = makeService(scan);

    service.onModuleInit();
    service.onModuleDestroy();

    await vi.advanceTimersByTimeAsync(600_000);

    expect(scan).not.toHaveBeenCalled();
  });

  it('error tolerant: a rejecting scan is absorbed and the interval keeps going', async () => {
    const scan = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const service = makeService(scan);

    service.onModuleInit();
    // Must not blow up as unhandled rejection nor kill the interval.
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(scan).toHaveBeenCalledTimes(2);

    service.onModuleDestroy();
  });
});
