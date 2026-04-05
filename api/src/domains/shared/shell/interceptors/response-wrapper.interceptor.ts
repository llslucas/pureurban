import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable, map } from 'rxjs'

@Injectable()
export class ResponseWrapperInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Excluir SSE endpoints (response é stream, não JSON)
    const response = context.switchToHttp().getResponse<{
      getHeader?: (name: string) => string | undefined
    }>()
    if (response.getHeader?.('content-type')?.includes('text/event-stream')) {
      return next.handle()
    }

    return next.handle().pipe(
      map((data: unknown) => {
        // Evitar double-wrapping
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          return data
        }
        return {
          data,
          meta: {
            timestamp: new Date().toISOString(),
          },
        }
      }),
    )
  }
}
