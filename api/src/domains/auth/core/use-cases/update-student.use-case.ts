import { Effect, Clock } from 'effect';
import {
  withEvents,
  noEvents,
} from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { PasswordHasher } from '../ports/password-hasher.port.js';
import {
  EmailAlreadyExistsError,
  StudentNotFoundError,
} from '../errors/auth.errors.js';
import type { UpdateStudentInput } from '../schemas/update-student.schema.js';

export const updateStudent = (input: {
  id: string;
  companyId: string;
  data: UpdateStudentInput;
}) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;
    const hasher = yield* PasswordHasher;

    const student = yield* userRepo.findByIdAndCompanyAndRole(
      input.id,
      input.companyId,
      'STUDENT',
    );
    if (!student) {
      return yield* Effect.fail(StudentNotFoundError.create(input.id));
    }

    const dataToUpdate: Partial<{
      email: string;
      password: string;
      name: string;
      isActive: boolean;
    }> = {};

    if (input.data.email !== undefined) {
      const normalizedEmail = input.data.email.toLowerCase().trim();
      if (normalizedEmail !== student.email) {
        const existing = yield* userRepo.findByEmail(normalizedEmail);
        if (existing && existing.id !== input.id) {
          return yield* Effect.fail(
            EmailAlreadyExistsError.create(normalizedEmail),
          );
        }
        dataToUpdate.email = normalizedEmail;
      }
    }

    if (input.data.name !== undefined) {
      dataToUpdate.name = input.data.name;
    }

    if (input.data.password !== undefined) {
      dataToUpdate.password = yield* hasher.hash(input.data.password);
    }

    if (input.data.isActive !== undefined) {
      dataToUpdate.isActive = input.data.isActive;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return noEvents(student);
    }

    const updated = yield* userRepo.updatePartial(
      input.id,
      input.companyId,
      dataToUpdate,
    );

    const occurredAt = new Date(yield* Clock.currentTimeMillis).toISOString();

    return withEvents(updated, [
      {
        type: 'auth.student_updated',
        data: { studentId: updated.id, companyId: input.companyId },
        occurredAt,
      },
    ]);
  });
