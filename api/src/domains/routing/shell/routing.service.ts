import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { createRoute } from '../core/use-cases/create-route.use-case.js';
import { listRoutes } from '../core/use-cases/list-routes.use-case.js';
import { getRoute } from '../core/use-cases/get-route.use-case.js';
import { updateRoute } from '../core/use-cases/update-route.use-case.js';
import { deleteRoute } from '../core/use-cases/delete-route.use-case.js';
import { assignStudent } from '../core/use-cases/assign-student.use-case.js';
import { unassignStudent } from '../core/use-cases/unassign-student.use-case.js';
import { listRouteStudents } from '../core/use-cases/list-route-students.use-case.js';
import { assignDriver } from '../core/use-cases/assign-driver.use-case.js';
import { unassignDriver } from '../core/use-cases/unassign-driver.use-case.js';
import { listRouteDrivers } from '../core/use-cases/list-route-drivers.use-case.js';
import { getMyRoutes } from '../core/use-cases/get-my-routes.use-case.js';
import type { CreateRouteInput } from '../core/schemas/create-route.schema.js';
import type { UpdateRouteInput } from '../core/schemas/update-route.schema.js';

export const ROUTING_RUNTIME = 'ROUTING_RUNTIME';

@Injectable()
export class RoutingService {
  constructor(
    @Inject(ROUTING_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  // Stripping de companyId na resposta — não vazar tenant info (padrão 2.3/2.4)
  private strip(route: {
    id: string;
    name: string;
    description: string | null;
    originCity: string;
    destinationCity: string;
    companyId: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: route.id,
      name: route.name,
      description: route.description,
      originCity: route.originCity,
      destinationCity: route.destinationCity,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  // ─── CRUD de Rotas ───────────────────────────────────────────

  async create(input: CreateRouteInput, companyId: string) {
    const route = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      createRoute(input, companyId),
    );
    return this.strip(route);
  }

  async list(companyId: string) {
    const routes = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      listRoutes({ companyId }),
    );
    return routes.map((r) => this.strip(r));
  }

  async getById(id: string, companyId: string) {
    const route = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      getRoute({ id, companyId }),
    );
    return this.strip(route);
  }

  async update(id: string, companyId: string, data: UpdateRouteInput) {
    const route = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      updateRoute({ id, companyId, data }),
    );
    return this.strip(route);
  }

  async remove(id: string, companyId: string) {
    await this.eventDispatcher.runAndDispatch(
      this.runtime,
      deleteRoute({ id, companyId }),
    );
    // void — 204 No Content
  }

  // ─── Vínculos Aluno-Rota ─────────────────────────────────────

  async assignStudent(routeId: string, studentId: string, companyId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      assignStudent({ routeId, studentId, companyId }),
    );
  }

  async unassignStudent(routeId: string, studentId: string, companyId: string) {
    await this.eventDispatcher.runAndDispatch(
      this.runtime,
      unassignStudent({ routeId, studentId, companyId }),
    );
  }

  async listRouteStudents(routeId: string, companyId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      listRouteStudents({ routeId, companyId }),
    );
  }

  // ─── Vínculos Motorista-Rota ─────────────────────────────────

  async assignDriver(routeId: string, driverId: string, companyId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      assignDriver({ routeId, driverId, companyId }),
    );
  }

  async unassignDriver(routeId: string, driverId: string, companyId: string) {
    await this.eventDispatcher.runAndDispatch(
      this.runtime,
      unassignDriver({ routeId, driverId, companyId }),
    );
  }

  async listRouteDrivers(routeId: string, companyId: string) {
    return this.eventDispatcher.runAndDispatch(
      this.runtime,
      listRouteDrivers({ routeId, companyId }),
    );
  }

  // ─── Minhas Rotas (DRIVER | STUDENT) ─────────────────────────

  async getMyRoutes(
    userId: string,
    role: 'DRIVER' | 'STUDENT',
    companyId: string,
  ) {
    const routes = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      getMyRoutes({ userId, role, companyId }),
    );
    // Stripping de companyId das rotas retornadas
    return routes.map((r) => this.strip(r));
  }
}
