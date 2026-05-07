import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Schema } from '@effect/schema';
import { EffectSchemaPipe } from './effect-schema.pipe.js';

const NameSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
});

describe('EffectSchemaPipe', () => {
  it('deve retornar o dado parseado quando input é válido', () => {
    const pipe = new EffectSchemaPipe(NameSchema);
    const result = pipe.transform({ name: 'Lucas', age: 30 });
    expect(result).toEqual({ name: 'Lucas', age: 30 });
  });

  it('deve lançar BadRequestException quando input é inválido', () => {
    const pipe = new EffectSchemaPipe(NameSchema);

    expect(() =>
      pipe.transform({ name: 'Lucas' } as Parameters<typeof pipe.transform>[0]),
    ).toThrow(BadRequestException);
  });

  it('deve retornar issues formatadas no body da exceção para schema complexo', () => {
    const ComplexSchema = Schema.Struct({
      email: Schema.String.pipe(Schema.minLength(5)),
      count: Schema.Number.pipe(Schema.positive()),
    });
    const pipe = new EffectSchemaPipe(ComplexSchema);

    try {
      pipe.transform({ email: 'ab', count: -1 } as Parameters<
        typeof pipe.transform
      >[0]);
      expect.fail('Deveria ter lançado BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as {
        code: string;
        details: { issues: unknown[] };
      };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details.issues).toBeDefined();
    }
  });
});
