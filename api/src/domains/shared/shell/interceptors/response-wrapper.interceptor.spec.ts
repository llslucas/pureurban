import { describe, it, expect, vi } from 'vitest'
import { ExecutionContext, CallHandler, StreamableFile } from '@nestjs/common'
import { of } from 'rxjs'
import { firstValueFrom } from 'rxjs'
import { Readable } from 'stream'
import { ResponseWrapperInterceptor } from './response-wrapper.interceptor.js'

function createCtx(contextType: string = 'http', sseMetadata: boolean = false): ExecutionContext {
  const handler = () => {}
  if (sseMetadata) {
    Reflect.defineMetadata('__sse__', true, handler)
  }
  return {
    getType: () => contextType,
    switchToHttp: () => ({
      getResponse: () => ({}),
    }),
    getHandler: () => handler,
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

  it('não deve fazer double-wrapping, mas deve mesclar timestamp', async () => {
    const ctx = createCtx()
    const alreadyWrapped = {
      data: { count: 5 },
      meta: { total: 5 },
    }
    const handler = createHandler(alreadyWrapped)

    const result = (await firstValueFrom(interceptor.intercept(ctx, handler))) as {
      data: unknown
      meta: Record<string, unknown>
    }

    expect(result.data).toEqual({ count: 5 })
    expect(result.meta.total).toBe(5)
    expect(result.meta.timestamp).toBeDefined()
  })

  it('deve preservar timestamp existente em respostas já envolvidas', async () => {
    const ctx = createCtx()
    const alreadyWrapped = {
      data: { count: 5 },
      meta: { timestamp: '2026-01-01T00:00:00.000Z', total: 5 },
    }
    const handler = createHandler(alreadyWrapped)

    const result = (await firstValueFrom(interceptor.intercept(ctx, handler))) as {
      data: unknown
      meta: Record<string, unknown>
    }

    expect(result.meta.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  it('deve excluir SSE endpoints (via metadata) do wrapping', async () => {
    const ctx = createCtx('http', true)
    const rawData = 'event: message\ndata: hello\n\n'
    const handler = createHandler(rawData)

    const result = await firstValueFrom(interceptor.intercept(ctx, handler))

    expect(result).toBe(rawData)
  })

  it('deve passar through em contexto não-HTTP', async () => {
    const ctx = createCtx('ws')
    const rawData = { message: 'ws data' }
    const handler = createHandler(rawData)

    const result = await firstValueFrom(interceptor.intercept(ctx, handler))

    expect(result).toEqual(rawData)
  })

  it('não deve interceptar StreamableFile', async () => {
    const ctx = createCtx()
    const stream = new Readable({ read() { this.push(null) } })
    const streamable = new StreamableFile(stream)
    const handler = createHandler(streamable)

    const result = await firstValueFrom(interceptor.intercept(ctx, handler))

    expect(result).toBeInstanceOf(StreamableFile)
  })
})
