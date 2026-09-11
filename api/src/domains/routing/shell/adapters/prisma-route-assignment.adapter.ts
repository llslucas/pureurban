import { Injectable, Logger } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type {
  RouteAssignmentRepositoryApi,
  StudentAssignmentData,
  DriverAssignmentData,
  RouteAssignedData,
} from '../../core/ports/route-assignment-repository.port.js';
import {
  RouteNotFoundError,
  UserNotFoundError,
  AssignmentAlreadyExistsError,
  AssignmentNotFoundError,
} from '../../core/errors/routing.errors.js';

// Constraints únicos esperados (Prisma define em schema.prisma com @@unique)
const ROUTE_STUDENT_UNIQUE = ['routeId', 'studentId'] as const;
const ROUTE_DRIVER_UNIQUE = ['routeId', 'driverId'] as const;

// P2002.meta.target NÃO é confiável nesta stack (Prisma 7 + @prisma/adapter-pg):
// vem vazio, e os campos só existem em meta.driverAdapterError.cause.constraint
// .fields, um detalhe interno do driver. Por isso o create trata qualquer P2002
// como violação do @@unique composto — no create ele é o único constraint
// violável (o pkey é uuid() gerado pelo banco). Mesma decisão de
// prisma-boarding.adapter.ts; os consts acima documentam o constraint esperado.

// Classifica internamente o motivo de um 404 em DELETE de assignment, sem vazar
// existence info ao cliente (que sempre recebe ASSIGNMENT_NOT_FOUND). Usado apenas
// para logging operacional/auditoria.
type AssignmentMissReason =
  | 'route_not_found'
  | 'user_not_found'
  | 'assignment_not_found';

async function classifyAssignmentMiss(
  prisma: PrismaService,
  routeId: string,
  userId: string,
  companyId: string,
  expectedRole: 'STUDENT' | 'DRIVER',
): Promise<AssignmentMissReason> {
  const [route, user] = await Promise.all([
    prisma.route.findFirst({
      where: { id: routeId, companyId },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { id: userId, companyId, role: expectedRole },
      select: { id: true },
    }),
  ]);
  if (!route) return 'route_not_found';
  if (!user) return 'user_not_found';
  return 'assignment_not_found';
}

// Helper: mapeia erros de infra para string legível
const toInfraError = (msg: string) => (e: unknown) => {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
    return new Error(`${msg}: FK constraint failed`);
  }
  return new Error(`${msg}: ${String(e)}`);
};

// Tipos discriminados para resultados internos do $transaction
type AssignStudentTxResult =
  | { kind: 'route_not_found' }
  | { kind: 'user_not_found' }
  | { kind: 'duplicate' }
  | {
      kind: 'ok';
      id: string;
      routeId: string;
      studentId: string;
      createdAt: Date;
    };

type AssignDriverTxResult =
  | { kind: 'route_not_found' }
  | { kind: 'user_not_found' }
  | { kind: 'duplicate' }
  | {
      kind: 'ok';
      id: string;
      routeId: string;
      driverId: string;
      createdAt: Date;
    };

@Injectable()
export class PrismaRouteAssignmentAdapter implements RouteAssignmentRepositoryApi {
  private readonly logger = new Logger(PrismaRouteAssignmentAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  assignStudent(
    routeId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<
    { id: string; routeId: string; studentId: string; createdAt: Date },
    RouteNotFoundError | UserNotFoundError | AssignmentAlreadyExistsError
  > {
    const prisma = this.prisma;
    return Effect.gen(function* () {
      // P2002 capturado dentro do try para retornar discriminado
      const result = yield* pipe(
        Effect.tryPromise<AssignStudentTxResult, Error>({
          try: async () => {
            try {
              return await prisma.$transaction<AssignStudentTxResult>(
                async (tx) => {
                  const route = await tx.route.findFirst({
                    where: { id: routeId, companyId },
                  });
                  if (!route) return { kind: 'route_not_found' };

                  const student = await tx.user.findFirst({
                    where: {
                      id: studentId,
                      companyId,
                      role: 'STUDENT',
                      isActive: true,
                    },
                  });
                  if (!student) return { kind: 'user_not_found' };

                  const created = await tx.routeStudent.create({
                    data: { routeId, studentId, companyId },
                  });
                  return {
                    kind: 'ok',
                    id: created.id,
                    routeId: created.routeId,
                    studentId: created.studentId,
                    createdAt: created.createdAt,
                  };
                },
              );
            } catch (e) {
              if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2002') {
                  return { kind: 'duplicate' };
                }
                // P2003: FK violation — race com delete de route/user entre findFirst e create.
                // Os checks anteriores já validaram tenant/role/isActive; tratar como user_not_found
                // (raça mais provável). Cliente recebe 404 USER_NOT_FOUND em vez de 500.
                if (e.code === 'P2003') {
                  return { kind: 'user_not_found' };
                }
              }
              throw e;
            }
          },
          catch: toInfraError('Falha ao vincular aluno'),
        }),
        Effect.orDie,
      );

      if (result.kind === 'route_not_found') {
        return yield* Effect.fail(RouteNotFoundError.create(routeId));
      }
      if (result.kind === 'user_not_found') {
        return yield* Effect.fail(UserNotFoundError.create(studentId));
      }
      if (result.kind === 'duplicate') {
        return yield* Effect.fail(AssignmentAlreadyExistsError.create());
      }

      return {
        id: result.id,
        routeId: result.routeId,
        studentId: result.studentId,
        createdAt: result.createdAt,
      };
    });
  }

  unassignStudent(
    routeId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<void, AssignmentNotFoundError> {
    const prisma = this.prisma;
    const logger = this.logger;
    return Effect.gen(function* () {
      // deleteMany evita race P2025 entre findFirst+delete: dois unassigns concorrentes
      // resultam em count=1 (vencedor) e count=0 (perdedor → 404), ambos sem exception.
      const result = yield* pipe(
        Effect.tryPromise({
          try: () =>
            prisma.routeStudent.deleteMany({
              where: { routeId, studentId, companyId },
            }),
          catch: toInfraError('Falha ao desvincular aluno'),
        }),
        Effect.orDie,
      );

      if (result.count === 0) {
        // Classifica internamente o motivo do 404 sem vazar info ao cliente.
        // Cliente sempre recebe ASSIGNMENT_NOT_FOUND.
        const reason = yield* pipe(
          Effect.tryPromise({
            try: () =>
              classifyAssignmentMiss(
                prisma,
                routeId,
                studentId,
                companyId,
                'STUDENT',
              ),
            catch: () => new Error('classification failed'),
          }),
          Effect.orElseSucceed(() => 'unknown' as const),
        );
        logger.warn(
          `unassignStudent miss [routeId=${routeId} studentId=${studentId} companyId=${companyId}] reason=${reason}`,
        );
        return yield* Effect.fail(AssignmentNotFoundError.create());
      }
    });
  }

  findStudentsByRoute(
    routeId: string,
    companyId: string,
  ): Effect.Effect<StudentAssignmentData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.routeStudent.findMany({
            where: {
              routeId,
              companyId,
              student: { isActive: true },
            },
            include: {
              student: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
          }),
        catch: toInfraError('Falha ao listar alunos da rota'),
      }),
      Effect.map((rows) =>
        rows.map((r) => ({
          id: r.id,
          routeId: r.routeId,
          studentId: r.studentId,
          name: r.student.name,
          email: r.student.email,
          createdAt: r.createdAt,
        })),
      ),
      Effect.orDie,
    );
  }

  assignDriver(
    routeId: string,
    driverId: string,
    companyId: string,
  ): Effect.Effect<
    { id: string; routeId: string; driverId: string; createdAt: Date },
    RouteNotFoundError | UserNotFoundError | AssignmentAlreadyExistsError
  > {
    const prisma = this.prisma;
    return Effect.gen(function* () {
      const result = yield* pipe(
        Effect.tryPromise<AssignDriverTxResult, Error>({
          try: async () => {
            try {
              return await prisma.$transaction<AssignDriverTxResult>(
                async (tx) => {
                  const route = await tx.route.findFirst({
                    where: { id: routeId, companyId },
                  });
                  if (!route) return { kind: 'route_not_found' };

                  const driver = await tx.user.findFirst({
                    where: {
                      id: driverId,
                      companyId,
                      role: 'DRIVER',
                      isActive: true,
                    },
                  });
                  if (!driver) return { kind: 'user_not_found' };

                  const created = await tx.routeDriver.create({
                    data: { routeId, driverId, companyId },
                  });
                  return {
                    kind: 'ok',
                    id: created.id,
                    routeId: created.routeId,
                    driverId: created.driverId,
                    createdAt: created.createdAt,
                  };
                },
              );
            } catch (e) {
              if (e instanceof Prisma.PrismaClientKnownRequestError) {
                if (e.code === 'P2002') {
                  return { kind: 'duplicate' };
                }
                if (e.code === 'P2003') {
                  return { kind: 'user_not_found' };
                }
              }
              throw e;
            }
          },
          catch: toInfraError('Falha ao vincular motorista'),
        }),
        Effect.orDie,
      );

      if (result.kind === 'route_not_found') {
        return yield* Effect.fail(RouteNotFoundError.create(routeId));
      }
      if (result.kind === 'user_not_found') {
        return yield* Effect.fail(UserNotFoundError.create(driverId));
      }
      if (result.kind === 'duplicate') {
        return yield* Effect.fail(AssignmentAlreadyExistsError.create());
      }

      return {
        id: result.id,
        routeId: result.routeId,
        driverId: result.driverId,
        createdAt: result.createdAt,
      };
    });
  }

  unassignDriver(
    routeId: string,
    driverId: string,
    companyId: string,
  ): Effect.Effect<void, AssignmentNotFoundError> {
    const prisma = this.prisma;
    const logger = this.logger;
    return Effect.gen(function* () {
      const result = yield* pipe(
        Effect.tryPromise({
          try: () =>
            prisma.routeDriver.deleteMany({
              where: { routeId, driverId, companyId },
            }),
          catch: toInfraError('Falha ao desvincular motorista'),
        }),
        Effect.orDie,
      );

      if (result.count === 0) {
        const reason = yield* pipe(
          Effect.tryPromise({
            try: () =>
              classifyAssignmentMiss(
                prisma,
                routeId,
                driverId,
                companyId,
                'DRIVER',
              ),
            catch: () => new Error('classification failed'),
          }),
          Effect.orElseSucceed(() => 'unknown' as const),
        );
        logger.warn(
          `unassignDriver miss [routeId=${routeId} driverId=${driverId} companyId=${companyId}] reason=${reason}`,
        );
        return yield* Effect.fail(AssignmentNotFoundError.create());
      }
    });
  }

  findDriversByRoute(
    routeId: string,
    companyId: string,
  ): Effect.Effect<DriverAssignmentData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.routeDriver.findMany({
            where: {
              routeId,
              companyId,
              driver: { isActive: true },
            },
            include: {
              driver: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
          }),
        catch: toInfraError('Falha ao listar motoristas da rota'),
      }),
      Effect.map((rows) =>
        rows.map((r) => ({
          id: r.id,
          routeId: r.routeId,
          driverId: r.driverId,
          name: r.driver.name,
          email: r.driver.email,
          createdAt: r.createdAt,
        })),
      ),
      Effect.orDie,
    );
  }

  findRoutesByDriver(
    driverId: string,
    companyId: string,
  ): Effect.Effect<RouteAssignedData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.routeDriver.findMany({
            where: {
              driverId,
              companyId,
              driver: { isActive: true },
            },
            select: {
              route: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  originCity: true,
                  destinationCity: true,
                  companyId: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          }),
        catch: toInfraError('Falha ao listar rotas do motorista'),
      }),
      Effect.map((rows): RouteAssignedData[] => rows.map((r) => r.route)),
      Effect.orDie,
    );
  }

  findRoutesByStudent(
    studentId: string,
    companyId: string,
  ): Effect.Effect<RouteAssignedData[]> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.routeStudent.findMany({
            where: {
              studentId,
              companyId,
              student: { isActive: true },
            },
            select: {
              route: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  originCity: true,
                  destinationCity: true,
                  companyId: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          }),
        catch: toInfraError('Falha ao listar rotas do aluno'),
      }),
      Effect.map((rows): RouteAssignedData[] => rows.map((r) => r.route)),
      Effect.orDie,
    );
  }
}
