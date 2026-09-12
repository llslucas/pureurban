import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Effect } from 'effect';
import { PrismaTripAccessAdapter } from '../adapters/prisma-trip-access.adapter.js';
import {
  TripNotActiveError,
  StudentNotOnTripError,
} from '../../core/errors/tracking.errors.js';
import { TripIdParam } from '../../core/schemas/location-ingest.schema.js';
import { EffectSchemaPipe } from '../../../shared/shell/pipes/effect-schema.pipe.js';

interface TrackingStreamRequest {
  params: { id?: string };
  user: { userId: string; companyId: string };
  trackingTripId?: string;
}

// Guard e não checagem no handler @Sse: a exceção do guard roda antes do
// routing do stream e chega ao exception filter como envelope; erro lançado
// dentro de um handler @Sse é engolido pelo stream e vira HTTP 200
// `event: error`. Ordem da I/O Matrix da 5.0: 400 (id não-UUID) → 409
// (viagem inexistente, encerrada ou de outra empresa) → 403 (aluno fora da
// rota). Diferente do boarding (viagem resolvida server-side), aqui o tripId
// vem da URL — o id é validado e anexado ao request para o handler.
@Injectable()
export class TrackingStreamGuard implements CanActivate {
  // Mesma instância do pipe usado nos handlers: o envelope do 400 é idêntico
  // ao do EffectSchemaPipe (mesmo código, mesmos details).
  private readonly idValidator = new EffectSchemaPipe(
    TripIdParam,
    'VALIDATION_ERROR',
  );

  constructor(private readonly tripAccess: PrismaTripAccessAdapter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TrackingStreamRequest>();
    // Pipes rodam DEPOIS de guards — o @Param(...) do handler nunca chegou a
    // validar nada quando este guard executa; daqui sai o 400 do contrato.
    // Ausente e malformado caem no mesmo 400 (decodeUnknown rejeita ambos).
    const tripId = this.idValidator.transform(request.params.id ?? '');

    const trip = await Effect.runPromise(
      this.tripAccess.findActiveTrip(tripId, request.user.companyId),
    );
    if (!trip) {
      throw TripNotActiveError.create();
    }

    const onRoute = await Effect.runPromise(
      this.tripAccess.isStudentOnRoute(
        request.user.userId,
        trip.routeId,
        request.user.companyId,
      ),
    );
    if (!onRoute) {
      throw StudentNotOnTripError.create();
    }

    request.trackingTripId = tripId;
    return true;
  }
}
