import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, HttpException } from '@nestjs/common';
import { Effect, Data } from 'effect';
import { EffectExceptionFilter } from './effect-exception.filter.js';

function createMockHost(
  responseMock: {
    status: (code: number) => { json: (body: unknown) => unknown };
    headersSent?: boolean;
  },
  requestMock?: { method: string; url: string },
  contextType: string = 'http',
): ArgumentsHost {
  return {
    getType: () => contextType,
    switchToHttp: () => ({
      getResponse: () => ({
        headersSent: responseMock.headersSent ?? false,
        ...responseMock,
      }),
      getRequest: () => requestMock ?? { method: 'GET', url: '/test' },
    }),
  } as unknown as ArgumentsHost;
}

describe('EffectExceptionFilter', () => {
  const filter = new EffectExceptionFilter();

  it('deve mapear DomainError (tagged) para o status HTTP correto', () => {
    const responses: Array<{ status: number; body: unknown }> = [];
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body });
        },
      }),
    });

    const domainError = {
      _tag: 'NotFoundError',
      code: 'STUDENT_NOT_FOUND',
      message: 'Student not found',
      httpStatus: 404,
    };

    filter.catch(domainError, host);

    expect(responses[0].status).toBe(404);
    expect(responses[0].body).toEqual({
      error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found' },
    });
  });

  it('deve padronizar HttpException com code e message', () => {
    const responses: Array<{ status: number; body: unknown }> = [];
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body });
        },
      }),
    });

    const httpException = new HttpException({ message: 'Not Found' }, 404);

    filter.catch(httpException, host);

    expect(responses[0].status).toBe(404);
    expect(responses[0].body).toEqual({
      error: { code: 'HTTP_ERROR', message: 'Not Found' },
    });
  });

  it('deve retornar 500 para erros desconhecidos', () => {
    const responses: Array<{ status: number; body: unknown }> = [];
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body });
        },
      }),
    });

    filter.catch(new Error('Unexpected boom'), host);

    expect(responses[0].status).toBe(500);
    expect((responses[0].body as { error: { code: string } }).error.code).toBe(
      'INTERNAL_ERROR',
    );
  });

  it('deve incluir details quando DomainError tem details', () => {
    const responses: Array<{ status: number; body: unknown }> = [];
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body });
        },
      }),
    });

    const domainError = {
      _tag: 'ValidationError',
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      httpStatus: 400,
      details: { issues: ['field required'] },
    };

    filter.catch(domainError, host);

    expect(responses[0].status).toBe(400);
    expect(
      (responses[0].body as { error: { details: unknown } }).error.details,
    ).toEqual({ issues: ['field required'] });
  });

  it('deve re-lançar exceção em contexto não-HTTP', () => {
    const host = createMockHost(
      { status: () => ({ json: () => {} }) },
      undefined,
      'ws',
    );
    const error = new Error('ws error');

    expect(() => filter.catch(error, host)).toThrow(error);
  });

  it('não deve enviar resposta se headers já foram enviados', () => {
    const statusFn = vi.fn();
    const host = createMockHost({
      status: statusFn,
      headersSent: true,
    });

    filter.catch(new Error('late error'), host);

    expect(statusFn).not.toHaveBeenCalled();
  });

  it('deve desembrulhar um FiberFailure (rejeição real do ManagedRuntime.runPromise) para o status HTTP correto', async () => {
    // Prova de consumo real: ManagedRuntime.runPromise (usado por todo *.service.ts
    // via EffectEventDispatcher) rejeita com FiberFailure, não com o tagged error em
    // si. Sem o unwrap em unwrapFiberFailure, este caso caía no branch 500 genérico.
    class SomeTaggedError extends Data.TaggedError('SomeTaggedError')<{
      readonly code: string;
      readonly message: string;
      readonly httpStatus: number;
    }> {}

    const fiberFailure = await Effect.runPromise(
      Effect.fail(
        new SomeTaggedError({
          code: 'SOME_ERROR',
          message: 'Algo deu errado',
          httpStatus: 422,
        }),
      ),
    ).catch((e: unknown) => e);

    const responses: Array<{ status: number; body: unknown }> = [];
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body });
        },
      }),
    });

    filter.catch(fiberFailure, host);

    expect(responses[0].status).toBe(422);
    expect(responses[0].body).toEqual({
      error: { code: 'SOME_ERROR', message: 'Algo deu errado' },
    });
  });

  it('deve preservar code personalizado de HttpException', () => {
    const responses: Array<{ status: number; body: unknown }> = [];
    const host = createMockHost({
      status: (code: number) => ({
        json: (body: unknown) => {
          responses.push({ status: code, body });
        },
      }),
    });

    const httpException = new HttpException(
      { code: 'FORBIDDEN', message: 'Access denied' },
      403,
    );

    filter.catch(httpException, host);

    expect(responses[0].body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });
});
