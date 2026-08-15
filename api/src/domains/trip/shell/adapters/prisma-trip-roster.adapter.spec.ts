import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import { PrismaTripRosterAdapter } from './prisma-trip-roster.adapter.js';

// Integração com banco real (docker compose up -d) — mocks de banco são
// proibidos pelo project-context.
describe('PrismaTripRosterAdapter (integração — banco real)', () => {
  let prisma: PrismaService;
  let adapter: PrismaTripRosterAdapter;

  const companyIds: string[] = [];
  const routeIds: string[] = [];
  const userIds: string[] = [];
  const routeStudentIds: string[] = [];

  const createCompany = async () => {
    const company = await prisma.company.create({
      data: { name: `Empresa ${randomUUID()}` },
    });
    companyIds.push(company.id);
    return company.id;
  };

  const createRoute = async (companyId: string) => {
    const route = await prisma.route.create({
      data: {
        name: `Rota ${randomUUID()}`,
        originCity: 'Origem',
        destinationCity: 'Destino',
        companyId,
      },
    });
    routeIds.push(route.id);
    return route.id;
  };

  const createStudent = async (
    companyId: string,
    overrides: { name?: string; isActive?: boolean } = {},
  ) => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        password: 'hash',
        name: overrides.name ?? 'Aluno Teste',
        role: 'STUDENT',
        isActive: overrides.isActive ?? true,
        companyId,
      },
    });
    userIds.push(user.id);
    return user.id;
  };

  const linkStudent = async (
    routeId: string,
    studentId: string,
    companyId: string,
  ) => {
    const link = await prisma.routeStudent.create({
      data: { routeId, studentId, companyId },
    });
    routeStudentIds.push(link.id);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    adapter = new PrismaTripRosterAdapter(prisma);
  });

  afterEach(async () => {
    if (routeStudentIds.length > 0) {
      await prisma.routeStudent.deleteMany({
        where: { id: { in: routeStudentIds } },
      });
      routeStudentIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
    if (routeIds.length > 0) {
      await prisma.route.deleteMany({ where: { id: { in: routeIds } } });
      routeIds.length = 0;
    }
    if (companyIds.length > 0) {
      await prisma.company.deleteMany({
        where: { id: { in: companyIds } },
      });
      companyIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('retorna só alunos isActive com role STUDENT, ignorando inativos e outros papéis', async () => {
    const companyId = await createCompany();
    const routeId = await createRoute(companyId);

    const active = await createStudent(companyId, { name: 'Ana Ativa' });
    const inactive = await createStudent(companyId, {
      name: 'Bia Inativa',
      isActive: false,
    });
    await linkStudent(routeId, active, companyId);
    await linkStudent(routeId, inactive, companyId);

    // Motorista vinculado à mesma rota via RouteStudent não é papel STUDENT —
    // não deve aparecer mesmo se por engano fosse vinculado como "aluno".
    const driver = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        password: 'hash',
        name: 'Motorista Vinculado',
        role: 'DRIVER',
        isActive: true,
        companyId,
      },
    });
    userIds.push(driver.id);
    await linkStudent(routeId, driver.id, companyId);

    const result = await Effect.runPromise(
      adapter.findRouteStudents(routeId, companyId),
    );

    expect(result).toHaveLength(1);
    expect(result[0].studentId).toBe(active);
    expect(result[0].name).toBe('Ana Ativa');
  });

  it('ignora vínculos de outra empresa — companyId errado não retorna o roster', async () => {
    const companyId = await createCompany();
    const otherCompanyId = await createCompany();
    const routeId = await createRoute(companyId);
    const student = await createStudent(companyId);
    await linkStudent(routeId, student, companyId);

    const result = await Effect.runPromise(
      adapter.findRouteStudents(routeId, otherCompanyId),
    );

    expect(result).toEqual([]);
  });

  // O teste acima varia o companyId da CHAMADA, que já curto-circuita na 1ª
  // query (links.length === 0). Este exercita o filtro companyId da 2ª query:
  // vínculo legítimo da empresa A apontando para um usuário da empresa B.
  it('ignora aluno de outra empresa mesmo com o vínculo na empresa consultada', async () => {
    const companyId = await createCompany();
    const otherCompanyId = await createCompany();
    const routeId = await createRoute(companyId);

    const ownStudent = await createStudent(companyId, { name: 'Ana Da Casa' });
    const foreignStudent = await createStudent(otherCompanyId, {
      name: 'Bruno De Fora',
    });

    await linkStudent(routeId, ownStudent, companyId);
    // Vínculo gravado na empresa A, mas o usuário pertence à empresa B.
    await linkStudent(routeId, foreignStudent, companyId);

    const result = await Effect.runPromise(
      adapter.findRouteStudents(routeId, companyId),
    );

    expect(result).toHaveLength(1);
    expect(result[0].studentId).toBe(ownStudent);
  });

  it('rota sem vínculo retorna lista vazia', async () => {
    const companyId = await createCompany();
    const routeId = await createRoute(companyId);

    const result = await Effect.runPromise(
      adapter.findRouteStudents(routeId, companyId),
    );

    expect(result).toEqual([]);
  });
});
