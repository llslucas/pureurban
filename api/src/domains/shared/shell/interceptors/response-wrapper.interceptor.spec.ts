import { describe, it, expect, vi } from 'vitest'
import { ExecutionContext, CallHandler } from '@nestjs/common'
import { of } from 'rxjs'
import { firstValueFrom } from 'rxjs'
import { ResponseWrapperInterceptor } from './response-wrapper.interceptor.js'

function createCtx(contentType?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        getHeader: (name: string) =>
          name === 'content-type' ? contentType : undefined,
      }),
    }),
  } as unknown as ExecutionContext
}

function createHandler(returnValue: unknown): CallHandler {
  return { handle: () => of(returnValue) }
}

describe('ResponseWrapperInterceptor', () => {
  const interceptor = new ResponseWrapperInterceptor()

  it('deve envolver resposta simples em { data, meta: { timestamp } }', async () => {
    const ctx = createCtx()
    const handler = createHandler({ name: 'Lucas' })

    const result = await firstValueFrom(interceptor.intercept(ctx, handler))

    expect(result).toMatchObject({
      data: { name: 'Lucas' },
      meta: { timestamp: expect.any(String) },
    })
  })

  it('não deve fazer double-wrapping quando resposta já tem { data, meta }', async () => {
    const ctx = createCtx()
    const alreadyWrapped = {
      data: { count: 5 },
      meta: { timestamp: '2026-01-01T00:00:00.000Z', total: 5 },
    }
    const handler = createHandler(alreadyWrapped)

    const result = await firstValueFrom(interceptor.intercept(ctx, handler))

    expect(result).toEqual(alreadyWrapped)
  })

  it('deve excluir SSE endpoints (text/event-stream) do wrapping', async () => {
    const ctx = createCtx('text/event-stream')
    const rawData = 'event: message\ndata: hello\n\n'
    const handler = createHandler(rawData)

    const result = await firstValueFrom(interceptor.intercept(ctx, handler))

    // SSE retorna dado raw sem wrapping
    expect(result).toBe(rawData)
  })
})
