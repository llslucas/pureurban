import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'

interface DomainErrorLike {
  _tag: string
  code: string
  message: string
  httpStatus?: number
  details?: Record<string, unknown>
}

@Catch()
export class EffectExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(EffectExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    // 1. Tagged errors do Effect (DomainError e derivados) — duck typing via _tag
    if (this.isDomainError(exception)) {
      const status = exception.httpStatus ?? 500
      return response.status(status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details && { details: exception.details }),
        },
      })
    }

    // 2. HttpException padrão do NestJS — delegar preservando body
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      return response.status(status).json(
        typeof exceptionResponse === 'string'
          ? { error: { code: 'HTTP_ERROR', message: exceptionResponse } }
          : { error: exceptionResponse },
      )
    }

    // 3. Erro desconhecido → 500
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    )
    return response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    })
  }

  private isDomainError(error: unknown): error is DomainErrorLike {
    return (
      typeof error === 'object' &&
      error !== null &&
      '_tag' in error &&
      'code' in error &&
      'message' in error
    )
  }
}
