import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Cause, Runtime } from 'effect';
import type { Response, Request } from 'express';

interface DomainErrorLike {
  _tag: string;
  code: string;
  message: string;
  httpStatus?: number;
  details?: Record<string, unknown>;
}

@Catch()
export class EffectExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(EffectExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Proteger contra contextos não-HTTP (WebSocket, RPC, etc.)
    if (host.getType() !== 'http') {
      this.logger.error(
        'EffectExceptionFilter invoked in non-HTTP context, re-throwing',
        exception instanceof Error ? exception.stack : exception,
      );
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Se os headers já foram enviados, não tentar responder novamente
    if (response.headersSent) {
      this.logger.warn('Headers already sent, cannot send error response');
      return;
    }

    // ManagedRuntime.runPromise rejeita com um FiberFailure que envelopa a Cause —
    // o erro tagueado original (Effect.fail) não está nas próprias chaves do reject,
    // e sim dentro dela. Sem este unwrap, todo Effect.fail vira 500 aqui.
    const unwrapped = this.unwrapFiberFailure(exception);

    // 1. Tagged errors do Effect (DomainError e derivados) — duck typing via _tag
    if (this.isDomainError(unwrapped)) {
      const status = unwrapped.httpStatus ?? 500;
      return response.status(status).json({
        error: {
          code: unwrapped.code,
          message: unwrapped.message,
          ...(unwrapped.details && { details: unwrapped.details }),
        },
      });
    }

    // 2. HttpException padrão do NestJS — padronizar formato { error: { code, message } }
    if (unwrapped instanceof HttpException) {
      const status = unwrapped.getStatus();
      const exceptionResponse = unwrapped.getResponse();

      if (typeof exceptionResponse === 'string') {
        return response.status(status).json({
          error: { code: 'HTTP_ERROR', message: exceptionResponse },
        });
      }

      // Garantir que o body sempre tenha code e message padronizados
      const body = exceptionResponse as Record<string, unknown>;
      const errorBody: Record<string, unknown> = {
        code: (body.code as string) ?? 'HTTP_ERROR',
        message: (body.message as string) ?? unwrapped.message,
      };
      if (body.details) {
        errorBody.details = body.details;
      }
      return response.status(status).json({ error: errorBody });
    }

    // 3. Erro desconhecido → 500 com dados operacionais no log
    this.logger.error(
      `Unhandled exception [${request.method} ${request.url}]`,
      unwrapped instanceof Error ? unwrapped.stack : unwrapped,
    );
    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }

  private isDomainError(error: unknown): error is DomainErrorLike {
    return (
      typeof error === 'object' &&
      error !== null &&
      '_tag' in error &&
      'code' in error &&
      'message' in error
    );
  }

  // ManagedRuntime.runPromise (Effect) rejeita com um FiberFailure — não com o
  // erro tagueado em si. O valor real de Effect.fail vive dentro da Cause;
  // Effect.die (defeito) e interrupções não têm Fail e passam adiante intactos
  // para caírem no branch 3 (500 genérico), como esperado.
  private unwrapFiberFailure(exception: unknown): unknown {
    if (!Runtime.isFiberFailure(exception)) {
      return exception;
    }
    const cause = exception[Runtime.FiberFailureCauseId];
    const failure = Cause.failureOption(cause);
    return failure._tag === 'Some' ? failure.value : exception;
  }
}
