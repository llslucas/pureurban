import { describe, it, expect } from 'vitest';
import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { IdempotencyKey } from './idempotency-key.decorator.js';

type ParamDecoratorFactory = (data: unknown, ctx: ExecutionContext) => unknown;
type RouteArgsMetadata = Record<
  string,
  { index: number; factory: ParamDecoratorFactory }
>;

// Padrão oficial do NestJS para testar factories de createParamDecorator:
// o decorator anexa a factory em metadata; extraímos e chamamos manualmente.
function getParamDecoratorFactory(
  decorator: () => ParameterDecorator,
): ParamDecoratorFactory {
  class TestClass {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    method(@decorator() _param: unknown) {}
  }
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestClass,
    'method',
  ) as RouteArgsMetadata;
  const key = Object.keys(args)[0];
  return args[key].factory;
}

function makeContext(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyKey', () => {
  const factory = getParamDecoratorFactory(IdempotencyKey);

  it('deve retornar a key quando o header está presente', () => {
    const ctx = makeContext({ 'x-idempotency-key': 'abc-123' });
    expect(factory(undefined, ctx)).toBe('abc-123');
  });

  it('deve remover espaços da key (trim)', () => {
    const ctx = makeContext({ 'x-idempotency-key': '  abc-123  ' });
    expect(factory(undefined, ctx)).toBe('abc-123');
  });

  it('deve lançar BadRequestException com MISSING_IDEMPOTENCY_KEY quando header ausente', () => {
    const ctx = makeContext({});
    expect(() => factory(undefined, ctx)).toThrow(BadRequestException);
    try {
      factory(undefined, ctx);
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: 'MISSING_IDEMPOTENCY_KEY',
      });
    }
  });

  it('deve lançar BadRequestException quando header só tem espaços', () => {
    const ctx = makeContext({ 'x-idempotency-key': '   ' });
    expect(() => factory(undefined, ctx)).toThrow(BadRequestException);
  });

  it('deve rejeitar key acima do limite com INVALID_IDEMPOTENCY_KEY, não deixar estourar no índice do Postgres', () => {
    const ctx = makeContext({ 'x-idempotency-key': 'a'.repeat(5000) });

    try {
      factory(undefined, ctx);
      expect.fail('Deveria ter lançado BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_IDEMPOTENCY_KEY',
      });
    }
  });

  it('deve aceitar uma key no limite exato', () => {
    const key = 'a'.repeat(200);
    const ctx = makeContext({ 'x-idempotency-key': key });
    expect(factory(undefined, ctx)).toBe(key);
  });
});
