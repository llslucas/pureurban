import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import { PrismaRouteAccessAdapter } from './prisma-route-access.adapter.js';

// Integração com banco real (docker compose up -d) — mocks de banco são
// proibidos pelo project-context.
describe('PrismaRouteAccessAdapter (integração — banco real)', () => {
  let prisma: PrismaService;
  let adapter: PrismaRouteAccessAdapter;

  const companyIds: string[] = [];
  const routeIds: string[] = [];
  const userIds: string[] = [];
  const routeDriverIds: string[] = [];

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

  const createDriver = async (companyId: string) => {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        password: 'hash',
        name: 'Motorista Teste',
        role: 'DRIVER',
        isActive: true,
        companyId,
      },
    });
    userIds.push(user.id);
    return user.id;
  };

  const linkDriver = async (
    routeId: string,
    driverId: string,
    companyId: string,
  ) => {
    const link = await prisma.routeDriver.create({
      data: { routeId, driverId, companyId },
    });
    routeDriverIds.push(link.id);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    adapter = new PrismaRouteAccessAdapter(prisma);
  });

  afterEach(async () => {
    if (routeDriverIds.length > 0) {
      await prisma.routeDriver.deleteMany({
        where: { id: { in: routeDriverIds } },
      });
      routeDriverIds.length = 0;
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
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
      companyIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('true quando o motorista está vinculado à rota na mesma empresa', async () => {
    const companyId = await createCompany();
    const routeId = await createRoute(companyId);
    const driverId = await createDriver(companyId);
    await linkDriver(routeId, driverId, companyId);

    const result = await Effect.runPromise(
      adapter.isDriverAssignedToRoute(routeId, driverId, companyId),
    );

    expect(result).toBe(true);
  });

  it('false para motorista da empresa que não está vinculado à rota', async () => {
    const companyId = await createCompany();
    const routeId = await createRoute(companyId);
    const driverId = await createDriver(companyId);
    const unlinkedDriverId = await createDriver(companyId);
    await linkDriver(routeId, driverId, companyId);

    const result = await Effect.runPromise(
      adapter.isDriverAssignedToRoute(routeId, unlinkedDriverId, companyId),
    );

    expect(result).toBe(false);
  });

  it('false quando o vínculo existe mas em outra empresa', async () => {
    const companyId = await createCompany();
    const otherCompanyId = await createCompany();
    const routeId = await createRoute(companyId);
    const driverId = await createDriver(companyId);
    await linkDriver(routeId, driverId, companyId);

    const result = await Effect.runPromise(
      adapter.isDriverAssignedToRoute(routeId, driverId, otherCompanyId),
    );

    expect(result).toBe(false);
  });

  it('false para rota inexistente — sem FK, é o mesmo caso de "não vinculado"', async () => {
    const companyId = await createCompany();
    const driverId = await createDriver(companyId);

    const result = await Effect.runPromise(
      adapter.isDriverAssignedToRoute(randomUUID(), driverId, companyId),
    );

    expect(result).toBe(false);
  });
});
