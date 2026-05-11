import { Effect } from 'effect';
import { noEvents } from '../../../shared/core/events/with-events.js';
import { RouteAssignmentRepository } from '../ports/route-assignment-repository.port.js';
import type { WithEvents } from '../../../shared/core/events/index.js';
import type { RouteAssignedData } from '../ports/route-assignment-repository.port.js';

// Roles disponíveis no domínio routing — locais para evitar dependência de auth/
type RoutingRole = 'DRIVER' | 'STUDENT' | 'ADMIN';

export const getMyRoutes = (input: {
  userId: string;
  role: RoutingRole;
  companyId: string;
}): Effect.Effect<
  WithEvents<RouteAssignedData[]>,
  never,
  RouteAssignmentRepository
> =>
  Effect.gen(function* () {
    const repo = yield* RouteAssignmentRepository;

    let routes: RouteAssignedData[];
    if (input.role === 'DRIVER') {
      routes = yield* repo.findRoutesByDriver(input.userId, input.companyId);
    } else if (input.role === 'STUDENT') {
      routes = yield* repo.findRoutesByStudent(input.userId, input.companyId);
    } else {
      // Defensa em profundidade: se RolesGuard falhar, não cair em fallback silencioso
      // que executaria query de student com userId arbitrário. Retorna lista vazia.
      routes = [];
    }

    return noEvents(routes);
  });
