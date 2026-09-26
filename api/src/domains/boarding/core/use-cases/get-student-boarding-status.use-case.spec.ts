import { describe, it, expect, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { getStudentBoardingStatus } from './get-student-boarding-status.use-case.js';
import {
  BoardingRepository,
  BoardingRepositoryApi,
  BoardingRecordData,
} from '../ports/boarding-repository.port.js';
import {
  AbsenceRepository,
  AbsenceRepositoryApi,
  BoardingAbsenceData,
} from '../ports/absence-repository.port.js';
import {
  TripAccess,
  TripAccessApi,
  ActiveReturnTripView,
} from '../ports/trip-access.port.js';

const NOW = new Date('2026-01-01T12:15:00.000Z');
const UNTIL = new Date('2026-01-01T12:17:00.000Z');

const input = {
  studentId: 'student-1',
  companyId: 'company-1',
  tripId: 'trip-return-1',
};

const activeReturnTrip: ActiveReturnTripView = {
  id: 'trip-return-1',
  companyId: 'company-1',
  routeId: 'route-1',
  driverId: 'driver-1',
  relatedTripId: 'trip-outbound-1',
  startedAt: new Date('2026-01-01T11:44:00.000Z'),
};

const checkIn: BoardingRecordData = {
  id: 'record-1',
  companyId: 'company-1',
  tripId: 'trip-return-1',
  studentId: 'student-1',
  recordedBy: 'driver-1',
  idempotencyKey: 'key-1',
  checkedInAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const activeAbsence: BoardingAbsenceData = {
  id: 'absence-1',
  companyId: 'company-1',
  tripId: 'trip-return-1',
  studentId: 'student-1',
  idempotencyKey: 'key-2',
  notifiedAt: NOW,
  cancellableUntil: UNTIL,
  cancelledAt: null,
  cancelIdempotencyKey: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const ports = () => ({
  tripAccess: {
    findActiveReturnTripById: vi
      .fn()
      .mockReturnValue(Effect.succeed(activeReturnTrip)),
  },
  boardingRepo: {
    findCheckInByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
  },
  absenceRepo: {
    findActiveByTripAndStudent: vi.fn().mockReturnValue(Effect.succeed(null)),
  },
});

const run = async (p: ReturnType<typeof ports>) => {
  const [result, events] = await Effect.runPromise(
    getStudentBoardingStatus(input).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(
            TripAccess,
            p.tripAccess as Partial<TripAccessApi> as TripAccessApi,
          ),
          Layer.succeed(
            BoardingRepository,
            p.boardingRepo as Partial<BoardingRepositoryApi> as BoardingRepositoryApi,
          ),
          Layer.succeed(
            AbsenceRepository,
            p.absenceRepo as Partial<AbsenceRepositoryApi> as AbsenceRepositoryApi,
          ),
        ),
      ),
    ),
  );
  return { result, events };
};

describe('getStudentBoardingStatus', () => {
  it('no check-in and no active absence ⇒ NOT_CHECKED_IN without absence', async () => {
    const p = ports();

    const { result, events } = await run(p);

    expect(result).toEqual({
      tripId: 'trip-return-1',
      status: 'NOT_CHECKED_IN',
      absence: null,
    });
    expect(events).toEqual([]);
    expect(p.boardingRepo.findCheckInByTripAndStudent).toHaveBeenCalledWith(
      'trip-return-1',
      'student-1',
      'company-1',
    );
    expect(p.absenceRepo.findActiveByTripAndStudent).toHaveBeenCalledWith(
      'trip-return-1',
      'student-1',
      'company-1',
    );
  });

  it('active absence ⇒ NOT_RETURNING carrying the server window', async () => {
    const p = ports();
    p.absenceRepo.findActiveByTripAndStudent.mockReturnValue(
      Effect.succeed(activeAbsence),
    );

    const { result } = await run(p);

    expect(result).toEqual({
      tripId: 'trip-return-1',
      status: 'NOT_RETURNING',
      absence: { id: 'absence-1', notifiedAt: NOW, cancellableUntil: UNTIL },
    });
  });

  it('check-in exists ⇒ CHECKED_IN, absence not even queried', async () => {
    const p = ports();
    p.boardingRepo.findCheckInByTripAndStudent.mockReturnValue(
      Effect.succeed(checkIn),
    );

    const { result } = await run(p);

    expect(result).toEqual({
      tripId: 'trip-return-1',
      status: 'CHECKED_IN',
      absence: null,
    });
    expect(p.absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
  });

  it('check-in wins over an active absence', async () => {
    const p = ports();
    p.boardingRepo.findCheckInByTripAndStudent.mockReturnValue(
      Effect.succeed(checkIn),
    );
    p.absenceRepo.findActiveByTripAndStudent.mockReturnValue(
      Effect.succeed(activeAbsence),
    );

    const { result } = await run(p);

    expect(result).toMatchObject({ status: 'CHECKED_IN', absence: null });
  });

  it('trip no longer ACTIVE RETURN ⇒ null without touching boarding', async () => {
    const p = ports();
    p.tripAccess.findActiveReturnTripById.mockReturnValue(Effect.succeed(null));

    const { result, events } = await run(p);

    expect(p.tripAccess.findActiveReturnTripById).toHaveBeenCalledWith(
      'trip-return-1',
      'company-1',
    );
    expect(result).toBeNull();
    expect(events).toEqual([]);
    expect(p.boardingRepo.findCheckInByTripAndStudent).not.toHaveBeenCalled();
    expect(p.absenceRepo.findActiveByTripAndStudent).not.toHaveBeenCalled();
  });
});
