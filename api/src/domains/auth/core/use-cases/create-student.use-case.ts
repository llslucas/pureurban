import { Effect, Clock } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { PasswordHasher } from '../ports/password-hasher.port.js';
import { EmailAlreadyExistsError } from '../errors/auth.errors.js';
import type { CreateStudentInput } from '../schemas/create-student.schema.js';

export const createStudent = (input: CreateStudentInput, companyId: string) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;
    const hasher = yield* PasswordHasher;

    const normalizedEmail = input.email.toLowerCase().trim();

    const existing = yield* userRepo.findByEmail(normalizedEmail);
    if (existing) {
      return yield* Effect.fail(
        EmailAlreadyExistsError.create(normalizedEmail),
      );
    }

    const hashedPassword = yield* hasher.hash(input.password);

    const user = yield* userRepo.createStudent({
      email: normalizedEmail,
      password: hashedPassword,
      name: input.name,
      companyId,
    });

    const occurredAt = new Date(yield* Clock.currentTimeMillis).toISOString();

    return withEvents(user, [
      {
        type: 'auth.student_created',
        data: { studentId: user.id, companyId },
        occurredAt,
      },
    ]);
  });
