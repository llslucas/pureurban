import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TripService } from '../../../trip/shell/trip.service.js';
import { TripNotActiveError } from '../../core/errors/boarding.errors.js';

interface BoardingEventsRequest {
  user: { userId: string; companyId: string };
  boardingTripId?: string;
}

// Guard e não checagem no handler @Sse: a exceção do guard roda antes do
// routing do stream e chega ao exception filter como 409 no envelope; erro
// lançado dentro de um handler @Sse é engolido pelo stream e vira HTTP 200
// `event: error`.
@Injectable()
export class BoardingEventsGuard implements CanActivate {
  constructor(private readonly tripService: TripService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BoardingEventsRequest>();

    // A viagem do stream é a viagem ativa do driver, resolvida server-side —
    // o próprio driver é o responsável (getActiveTrip filtra por driverId e
    // companyId), então não há stream de viagem de outro motorista.
    const trip = await this.tripService.getActiveTrip(
      request.user.userId,
      request.user.companyId,
    );
    if (!trip) {
      throw TripNotActiveError.create();
    }

    request.boardingTripId = trip.id;
    return true;
  }
}
