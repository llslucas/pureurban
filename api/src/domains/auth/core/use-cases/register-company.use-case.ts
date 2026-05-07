import { Effect } from 'effect';
import { withEvents } from '../../../shared/core/events/with-events.js';
import { UserRepository } from '../ports/user-repository.port.js';
import { PasswordHasher } from '../ports/password-hasher.port.js';
import { TokenService } from '../ports/token-service.port.js';
import { EmailAlreadyExistsError } from '../errors/auth.errors.js';
import type { RegisterInput } from '../schemas/register.schema.js';

export const registerCompany = (input: RegisterInput) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository;
    const hasher = yield* PasswordHasher;
    const tokenSvc = yield* TokenService;

    // 1. Verificar email duplicado
    const existing = yield* userRepo.findByEmail(input.email);
    if (existing) {
      return yield* Effect.fail(EmailAlreadyExistsError.create(input.email));
    }

    // 2. Hash da senha
    const hashedPassword = yield* hasher.hash(input.password);

    // 3. Criar Company + User atomicamente (adapter gerencia a transação)
    const user = yield* userRepo.create({
      email: input.email,
      password: hashedPassword,
      name: input.name,
      role: 'ADMIN',
      companyName: input.name,
    });

    // 4. Gerar tokens
    const tokens = yield* tokenSvc.generateTokens({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    });

    return withEvents({ user, tokens }, [
      {
        type: 'auth.company_registered',
        data: { companyId: user.companyId },
        occurredAt: new Date().toISOString(),
      },
    ]);
  });
