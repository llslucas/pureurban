import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseWrapperInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Proteger contra contextos não-HTTP (WebSocket, RPC, etc.)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    // Excluir SSE endpoints via decorator/metadata pattern
    // Headers ainda não existem antes do handler; usar classe do controller para detectar Sse()
    const handler = context.getHandler();
    const isSse = Reflect.getMetadata('__sse__', handler) === true;

    if (isSse) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        // Não interceptar StreamableFile (downloads binários)
        if (data instanceof StreamableFile) {
          return data;
        }

        // Evitar double-wrapping: se já tem { data, meta }, mesclar timestamp
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          const existing = data as {
            data: unknown;
            meta: Record<string, unknown>;
          };
          return {
            data: existing.data,
            meta: {
              ...existing.meta,
              timestamp: existing.meta.timestamp ?? new Date().toISOString(),
            },
          };
        }

        return {
          data,
          meta: {
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
