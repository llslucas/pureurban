import { describe, it, expect } from 'vitest'
import { ArgumentsHost, HttpException } from '@nestjs/common'
import { EffectExceptionFilter } from './effect-exception.filter.js'

function createMockHost(responseMock: {
  status: (code: number) => { json: (body: unknown) => unknown }
}): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => responseMock,
    }),
  } as unknown as ArgumentsHost
}

describe('EffectExceptionFilter', () => {
  const filter = new EffectExceptionFilter()

  it('deve mapear DomainError (tagged) para o status HTTP correto', () => {
    const responses: Array<{ status: number; body: unknown }> = []
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body })
        },
      }),
    })

    const domainError = {
      _tag: 'NotFoundError',
      code: 'STUDENT_NOT_FOUND',
      message: 'Student not found',
      httpStatus: 404,
    }

    filter.catch(domainError, host)

    expect(responses[0].status).toBe(404)
    expect(responses[0].body).toEqual({
      error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found' },
    })
  })

  it('deve delegar HttpException mantendo o body original', () => {
    const responses: Array<{ status: number; body: unknown }> = []
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body })
        },
      }),
    })

    const httpException = new HttpException({ message: 'Not Found' }, 404)

    filter.catch(httpException, host)

    expect(responses[0].status).toBe(404)
    expect(responses[0].body).toEqual({ error: { message: 'Not Found' } })
  })

  it('deve retornar 500 para erros desconhecidos', () => {
    const responses: Array<{ status: number; body: unknown }> = []
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body })
        },
      }),
    })

    filter.catch(new Error('Unexpected boom'), host)

    expect(responses[0].status).toBe(500)
    expect((responses[0].body as { error: { code: string } }).error.code).toBe(
      'INTERNAL_ERROR',
    )
  })

  it('deve incluir details quando DomainError tem details', () => {
    const responses: Array<{ status: number; body: unknown }> = []
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body })
        },
      }),
    })

    const domainError = {
      _tag: 'ValidationError',
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      httpStatus: 400,
      details: { issues: ['field required'] },
    }

    filter.catch(domainError, host)

    expect(responses[0].status).toBe(400)
    expect(
      (responses[0].body as { error: { details: unknown } }).error.details,
    ).toEqual({ issues: ['field required'] })
  })
})
