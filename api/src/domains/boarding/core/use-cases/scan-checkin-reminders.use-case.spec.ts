import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer, Runtime } from 'effect';
import { TestClock, TestContext } from 'effect';
import {
  scanCheckinReminders,
  CHECKIN_REMINDER_DELAY_MS,
} from './scan-checkin-reminders.use-case.js';
import {
  BoardingRepository,
  BoardingRepositoryApi,
  CheckInSummary,
} from '../ports/boarding-repository.port.js';
import {
  AbsenceRepository,
  AbsenceRepositoryApi,
} from '../ports/absence-repository.port.js';
import {
  ReminderRepository,
  ReminderRepositoryApi,
  BoardingReminderData,
} from '../ports/reminder-repository.port.js';
import {
  TripAccess,
  TripAccessApi,
  ActiveReturnTripView,
} from '../ports/trip-access.port.js';

// now pinned by the TestClock: the whole suite runs against this instant,
// without the real clock (inclusive boundary proven with exact equality).
const NOW = new Date('2026-01-01T12:00:00.000Z');
// Exactly the 15-minute period before NOW — the inclusive boundary.
const STARTED_AT = new Date(NOW.getTime() - CHECKIN_REMINDER_DELAY_MS);

const returnTrip: ActiveReturnTripView = {
  id: 'trip-return-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  relatedTripId: 'trip-outbound-1',
  startedAt: STARTED_AT,
};

const outboundCheckIn = (studentId: string): CheckInSummary => ({
  studentId,
  checkedInAt: new Date('2026-01-01T10:00:00.000Z'),
});

let reminderSeq = 0;

const storedReminder = (args: {
  companyId: string;
  tripId: string;
  studentId: string;
  remindedAt: Date;
}): BoardingReminderData => ({
  id: `reminder-${++reminderSeq}`,
  createdAt: args.remindedAt,
  updatedAt: args.remindedAt,
  ...args,
});

function makeLayer(
  tripAccess: Partial<TripAccessApi>,
  boardingRepo: Partial<BoardingRepositoryApi>,
  absenceRepo: Partial<AbsenceRepositoryApi>,
  reminderRepo: Partial<ReminderRepositoryApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(TripAccess, tripAccess as TripAccessApi),
    Layer.succeed(BoardingRepository, boardingRepo as BoardingRepositoryApi),
    Layer.succeed(AbsenceRepository, absenceRepo as AbsenceRepositoryApi),
    Layer.succeed(ReminderRepository, reminderRepo as ReminderRepositoryApi),
  );
}

// Building the TestContext and TestClock.setTime itself are expensive (~5ms
// each): the Runtime is captured ONCE at module scope and the clock is only
// re-adjusted when the requested now differs from the current instant
// (cancellation spec pattern).
const testRuntimePromise: Promise<Runtime.Runtime<never>> = Effect.runPromise(
  Effect.runtime<never>().pipe(Effect.provide(TestContext.TestContext)),
);
let clockNowMs = Number.NaN;

const setClock = async (now: Date) => {
  if (now.getTime() === clockNowMs) return;
  const runtime = await testRuntimePromise;
  await Runtime.runPromise(runtime)(TestClock.setTime(now));
  clockNowMs = now.getTime();
};

type Ports = {
  tripAccess: Partial<TripAccessApi>;
  boardingRepo: Partial<BoardingRepositoryApi>;
  absenceRepo: Partial<AbsenceRepositoryApi>;
  reminderRepo: Partial<ReminderRepositoryApi>;
};

const run = async (
  now: Date,
  ports: Ports,
): Promise<{ result: unknown; events: unknown[] }> => {
  await setClock(now);
  const runtime = await testRuntimePromise;
  const [result, events] = await Runtime.runPromise(runtime)(
    scanCheckinReminders().pipe(
      Effect.provide(
        makeLayer(
          ports.tripAccess,
          ports.boardingRepo,
          ports.absenceRepo,
          ports.reminderRepo,
        ),
      ),
    ),
  );
  return { result, events };
};

// Ports satisfied for the happy path — each test overrides only what it
// needs. The OUTBOUND holds the candidate check-ins; the RETURN and the
// absences are empty; no reminder row exists yet.
const happyPorts = (trips: ActiveReturnTripView[] = [returnTrip]): Ports => ({
  tripAccess: {
    findActiveReturnTrips: vi.fn().mockReturnValue(Effect.succeed(trips)),
  },
  boardingRepo: {
    findCheckInsByTrip: vi.fn((tripId: string) =>
      Effect.succeed(
        tripId === returnTrip.relatedTripId
          ? [outboundCheckIn('student-1')]
          : [],
      ),
    ),
  },
  absenceRepo: {
    findActiveByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
  },
  reminderRepo: {
    findByTrip: vi.fn().mockReturnValue(Effect.succeed([])),
    create: vi.fn((args: Parameters<ReminderRepositoryApi['create']>[0]) =>
      Effect.succeed({ created: true, record: storedReminder(args) }),
    ),
  },
});

describe('scanCheckinReminders', () => {
  it('happy path: creates the row with the companyId of the trip and emits 1 event with the exact contract payload', async () => {
    const ports = happyPorts();

    const { result, events } = await run(NOW, ports);

    expect(ports.reminderRepo.create).toHaveBeenCalledOnce();
    expect(ports.reminderRepo.create).toHaveBeenCalledWith({
      companyId: 'company-1',
      tripId: 'trip-return-1',
      studentId: 'student-1',
      remindedAt: NOW,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'boarding.checkin_reminder',
      data: {
        tripId: 'trip-return-1',
        studentId: 'student-1',
        // The event's remindedAt is the injected clock instant, in ISO.
        remindedAt: NOW.toISOString(),
      },
      occurredAt: NOW.toISOString(),
    });
    expect(result).toMatchObject({
      scannedTrips: 1,
      remindersCreated: 1,
    });
  });

  it('fronteira INCLUSIVA: startedAt há exatamente 15 min emite', async () => {
    // STARTED_AT é NOW - 15min: elapsed == delay, e >= inclui a igualdade.
    const ports = happyPorts();

    const { events } = await run(NOW, ports);

    expect(events).toHaveLength(1);
  });

  it('1ms before the period: no row and no event', async () => {
    const ports = happyPorts([
      {
        ...returnTrip,
        startedAt: new Date(STARTED_AT.getTime() + 1),
      },
    ]);

    const { events } = await run(NOW, ports);

    expect(ports.reminderRepo.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('re-scan (next tick): previous reminder ⇒ nothing new, no row and no event', async () => {
    const ports = happyPorts();
    (ports.reminderRepo.findByTrip as ReturnType<typeof vi.fn>).mockReturnValue(
      Effect.succeed([
        storedReminder({
          companyId: 'company-1',
          tripId: 'trip-return-1',
          studentId: 'student-1',
          remindedAt: new Date('2026-01-01T11:46:00.000Z'),
        }),
      ]),
    );

    const { events } = await run(NOW, ports);

    expect(ports.reminderRepo.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('creation race (created: false): the loser emits NO event', async () => {
    const ports = happyPorts();
    (ports.reminderRepo.create as ReturnType<typeof vi.fn>).mockReturnValue(
      Effect.succeed({
        created: false,
        record: storedReminder({
          companyId: 'company-1',
          tripId: 'trip-return-1',
          studentId: 'student-1',
          remindedAt: NOW,
        }),
      }),
    );

    const { result, events } = await run(NOW, ports);

    expect(events).toEqual([]);
    expect(result).toMatchObject({ remindersCreated: 0 });
  });

  it('check-in on the RETURN exists: the student is not a candidate (already boarded, no reminder needed)', async () => {
    const ports = happyPorts();
    (
      ports.boardingRepo.findCheckInsByTrip as ReturnType<typeof vi.fn>
    ).mockImplementation((tripId: string) =>
      Effect.succeed(
        tripId === 'trip-return-1' ? [outboundCheckIn('student-1')] : [],
      ),
    );

    const { events } = await run(NOW, ports);

    expect(ports.reminderRepo.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('active absence on the RETURN: the student is not a candidate (already said they are not coming)', async () => {
    const ports = happyPorts();
    (
      ports.absenceRepo.findActiveByTrip as ReturnType<typeof vi.fn>
    ).mockReturnValue(
      Effect.succeed([
        {
          id: 'absence-1',
          companyId: 'company-1',
          tripId: 'trip-return-1',
          studentId: 'student-1',
          idempotencyKey: 'key-1',
          notifiedAt: NOW,
          cancellableUntil: NOW,
          cancelledAt: null,
          cancelIdempotencyKey: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]),
    );

    const { events } = await run(NOW, ports);

    expect(ports.reminderRepo.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('absence filters PER STUDENT: an active absence of another student does not block the candidate', async () => {
    const ports = happyPorts();
    (
      ports.boardingRepo.findCheckInsByTrip as ReturnType<typeof vi.fn>
    ).mockImplementation((tripId: string) =>
      Effect.succeed(
        tripId === returnTrip.relatedTripId
          ? [outboundCheckIn('student-1'), outboundCheckIn('student-2')]
          : [],
      ),
    );
    (
      ports.absenceRepo.findActiveByTrip as ReturnType<typeof vi.fn>
    ).mockReturnValue(
      Effect.succeed([
        {
          id: 'absence-2',
          companyId: 'company-1',
          tripId: 'trip-return-1',
          studentId: 'student-2',
          idempotencyKey: 'key-2',
          notifiedAt: NOW,
          cancellableUntil: NOW,
          cancelledAt: null,
          cancelIdempotencyKey: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]),
    );

    const { events } = await run(NOW, ports);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'boarding.checkin_reminder',
      data: { tripId: 'trip-return-1', studentId: 'student-1' },
    });
  });

  it('CANCELLED absence never returns in findActiveByTrip (append-only): the student is eligible again', async () => {
    // The adapter only returns cancelledAt IS NULL — the core never sees the
    // cancelled row and the student is a candidate again. The port below
    // already reflects that.
    const ports = happyPorts();
    (
      ports.absenceRepo.findActiveByTrip as ReturnType<typeof vi.fn>
    ).mockReturnValue(Effect.succeed([]));

    const { events } = await run(NOW, ports);

    expect(ports.reminderRepo.create).toHaveBeenCalledOnce();
    expect(events).toHaveLength(1);
  });

  it('null relatedTripId (orphan trip): skip — no candidates, not even a boarding query', async () => {
    const ports = happyPorts([{ ...returnTrip, relatedTripId: null }]);

    const { events } = await run(NOW, ports);

    expect(ports.boardingRepo.findCheckInsByTrip).not.toHaveBeenCalled();
    expect(ports.reminderRepo.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('system-wide sweep: two trips from different companies create each row with the OWN companyId of the trip', async () => {
    const tripB: ActiveReturnTripView = {
      id: 'trip-return-2',
      companyId: 'company-2',
      routeId: 'route-2',
      driverId: 'driver-2',
      relatedTripId: 'trip-outbound-2',
      startedAt: STARTED_AT,
    };
    const ports = happyPorts([returnTrip, tripB]);
    (
      ports.boardingRepo.findCheckInsByTrip as ReturnType<typeof vi.fn>
    ).mockImplementation((tripId: string) =>
      Effect.succeed(
        tripId === 'trip-outbound-1'
          ? [outboundCheckIn('student-1')]
          : tripId === 'trip-outbound-2'
            ? [outboundCheckIn('student-9')]
            : [],
      ),
    );

    const { events } = await run(NOW, ports);

    expect(events).toHaveLength(2);
    const companies = (
      ports.reminderRepo.create as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => (call[0] as { companyId: string }).companyId);
    expect(companies).toContain('company-1');
    expect(companies).toContain('company-2');
    expect(
      events
        .map((e) => (e as { data: { studentId: string } }).data.studentId)
        .sort(),
    ).toEqual(['student-1', 'student-9']);
  });

  it('RETURN still outside the period: skipped before any boarding query or creation', async () => {
    const notDue = happyPorts([
      { ...returnTrip, startedAt: new Date(NOW.getTime() - 1000) },
    ]);

    const { events } = await run(NOW, notDue);

    expect(
      (notDue.boardingRepo.findCheckInsByTrip as ReturnType<typeof vi.fn>).mock
        .calls,
    ).toEqual([]);
    expect(notDue.reminderRepo.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});
