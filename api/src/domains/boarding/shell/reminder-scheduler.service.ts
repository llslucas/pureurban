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
