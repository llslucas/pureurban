import { Injectable } from '@nestjs/common';
import { Effect, pipe } from 'effect';
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js';
import type { RouteAccessApi } from '../../core/ports/route-access.port.js';
import { toInfraError } from '../../../shared/shell/infra/to-infra-error.js';

@Injectable()
export class PrismaRouteAccessAdapter implements RouteAccessApi {
  constructor(private readonly prisma: PrismaService) {}

  // Adapter de trip/shell lendo routing.route_drivers — mesma fronteira que o
  // roster já atravessa, sem JOIN cross-schema.
  isDriverAssignedToRoute(
    routeId: string,
    driverId: string,
    companyId: string,
  ): Effect.Effect<boolean> {
    return pipe(
      Effect.tryPromise({
        try: () =>
          this.prisma.routeDriver.findFirst({
            where: { routeId, driverId, companyId },
            select: { id: true },
          }),
        catch: toInfraError('Falha ao verificar vínculo motorista-rota'),
      }),
      Effect.map((link) => link !== null),
      Effect.orDie,
    );
  }
}
