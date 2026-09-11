import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ReminderScanResult } from '../core/use-cases/scan-checkin-reminders.use-case.js';
import { BoardingService } from './boarding.service.js';

// Scan cadence is a SHELL decision (when to check); who to remind and the
// 15-minute period are core decisions. Changing the cadence means changing
// this const — no @nestjs/schedule: a plain setInterval suffices and brings
// no new dependency.
const REMINDER_SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class ReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly boardingService: BoardingService) {}

  onModuleInit(): void {
    // Test kill-switch: every e2e file boots the full AppModule, and the scan
    // is a system-wide sweep against the one shared PostgreSQL — a stray tick
    // from a parallel file's app would steal the seeded creation and flake the
    // Story 4.4 assertions. e2e runs with REMINDER_SCAN_ENABLED=false; the
    // explicit runOnce() remains the trigger there.
    if (process.env.REMINDER_SCAN_ENABLED === 'false') {
      // Silenciar o FR30 (lembretes) sem nenhum sinal fez um ambiente herdar a
      // flag de docs de e2e e perder a feature (RV7, retro do épico 4).
      this.logger.warn(
        'REMINDER_SCAN_ENABLED=false — lembretes de check-in DESLIGADOS',
      );
      return;
    }

    this.intervalId = setInterval(() => {
      void this.runOnce();
    }, REMINDER_SCAN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Public for the e2e to trigger the scan without waiting for the next tick —
  // returns the scan summary ({ scannedTrips, remindersCreated }) for
  // assertions. Error tolerant: a failing scan is logged and the interval
  // keeps running — a trip whose scan broke gets reminded on the next tick.
  async runOnce(): Promise<ReminderScanResult | undefined> {
    try {
      return await this.boardingService.runReminderScan();
    } catch (error) {
      this.logger.error(
        'Check-in reminder scan failed — next tick will retry',
        error instanceof Error ? error.stack : String(error),
      );
      return undefined;
    }
  }
}
