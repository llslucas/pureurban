import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getPendingReminder } from './get-pending-reminder.use-case.js';
import {
  BoardingRepository,
  BoardingRepositoryApi,
} from '../ports/boarding-repository.port.js';
import {
  AbsenceRepository,
  AbsenceRepositoryApi,
  BoardingAbsenceData,
} from '../ports/absence-repository.port.js';
import {
  ReminderRepository,
  ReminderRepositoryApi,
  BoardingReminderData,
} from '../ports/reminder-repository.port.js';

const NOW = new Date('2026-01-01T12:15:00.000Z');

const input = {
  studentId: 'student-1',
  companyId: 'company-1',
  tripId: 'trip-return-1',
};

const storedReminder: BoardingReminderData = {
  id: 'reminder-1',
  companyId: 'company-1',
  tripId: 'trip-return-1',
  studentId: 'student-1',
  remindedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const activeAbsence: BoardingAbsenceData = {
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
};

function makeLayer(
  reminderRepo: Partial<ReminderRepositoryApi>,
  boardingRepo: Partial<BoardingRepositoryApi>,
  absenceRepo: Partial<AbsenceRepositoryApi>,
) {
  return Layer.mergeAll(
    Layer.succeed(ReminderRepository, reminderRepo as ReminderRepositoryApi),
    Layer.succeed(BoardingRepository, boardingRepo as BoardingRepositoryApi),
    Layer.succeed(AbsenceRepository, absenceRepo as AbsenceRepositoryApi),
  );
}

// Ports satisfied for the pending path — each test overrides only what it
// needs. Row exists; no check-in on the RETURN; no active absence.
const happyPorts = () => ({
  reminderRepo: {
    findByTripAndStudent: vi
      .fn()
      .mockReturnValue(Effect.succeed(storedReminder)),
  },
  boardingRepo: {
    findCheckInByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
  },
  absenceRepo: {
    findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
  },
});

const run = async (ports: ReturnType<typeof happyPorts>) => {
  const [result, events] = await Effect.runPromise(
    getPendingReminder(input).pipe(
      Effect.provide(
        makeLayer(ports.reminderRepo, ports.boardingRepo, ports.absenceRepo),
      ),
    ),
  );
  return { result, events };
};

describe('getPendingReminder', () => {
  it('pending path: row exists, no check-in and no absence ⇒ { tripId, remindedAt }', async () => {
    const ports = happyPorts();

    const { result, events } = await run(ports);

    expect(ports.reminderRepo.findByTripAndStudent).toHaveBeenCalledWith(
      'trip-return-1',
      'student-1',
      'company-1',
    );
    expect(result).toEqual({
      tripId: 'trip-return-1',
      remindedAt: NOW,
    });
    // Pure read derivation: never any events (noEvents pattern).
    expect(events).toEqual([]);
  });

  it('no reminder row ⇒ null, without querying boarding or absence', async () => {
    const ports = happyPorts();
    (
      ports.reminderRepo.findByTripAndStudent as ReturnType<typeof vi.fn>
    ).mockReturnValue(Effect.succeed(null));

    const { result } = await run(ports);

    expect(result).toBeNull();
    expect(
      ports.boardingRepo.findCheckInByTripAndStudent,
    ).not.toHaveBeenCalled();
    expect(ports.absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
  });

  it('check-in on the RETURN exists ⇒ null (pending state resolved by boarding)', async () => {
    const ports = happyPorts();
    (
      ports.boardingRepo.findCheckInByTripAndStudent as ReturnType<typeof vi.fn>
    ).mockReturnValue(
      Effect.succeed({
        id: 'record-1',
        companyId: 'company-1',
        tripId: 'trip-return-1',
        studentId: 'student-1',
        recordedBy: 'driver-1',
        idempotencyKey: 'key-1',
        checkedInAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );

    const { result } = await run(ports);

    expect(result).toBeNull();
    // Rule order: the absence is not even queried after the check-in.
    expect(ports.absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
  });

  it('active absence exists ⇒ null (pending state resolved by the notice)', async () => {
    const ports = happyPorts();
    (
      ports.absenceRepo.findActiveByTripAndStudent as ReturnType<typeof vi.fn>
    ).mockReturnValue(Effect.succeed(activeAbsence));

    const { result } = await run(ports);

    expect(result).toBeNull();
  });

  it('cancelled absence (cancelledAt set) is not "active": pending state comes back', async () => {
    // The adapter only returns rows with cancelledAt IS NULL — the absence
    // undone in 4.3 never shows up here, and the student who reversed the
    // notice becomes remindable again. The port below reflects the adapter
    // contract.
    const ports = happyPorts();
    (
      ports.absenceRepo.findActiveByTripAndStudent as ReturnType<typeof vi.fn>
    ).mockReturnValue(Effect.succeed(null));

    const { result } = await run(ports);

    expect(result).toEqual({ tripId: 'trip-return-1', remindedAt: NOW });
  });
});
