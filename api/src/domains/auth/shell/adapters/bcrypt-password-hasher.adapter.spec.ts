import { describe, it, expect, vi } from 'vitest';
import { Effect } from 'effect';
import { BcryptPasswordHasherAdapter } from './bcrypt-password-hasher.adapter.js';

describe('BcryptPasswordHasherAdapter', () => {
  const adapter = new BcryptPasswordHasherAdapter();

  it('deve criar hash diferente do plaintext e verificar (hash + compare com sucesso)', async () => {
    const password = 'minha-senha-segura';
    const hash = await Effect.runPromise(adapter.hash(password));

    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true); // bcrypt hash prefix

    const isValid = await Effect.runPromise(adapter.compare(password, hash));
    expect(isValid).toBe(true);
  });

  it('deve retornar false ao comparar senha incorreta com hash', async () => {
    const hash = await Effect.runPromise(adapter.hash('senha-correta'));
    const isValid = await Effect.runPromise(
      adapter.compare('senha-errada', hash),
    );
    expect(isValid).toBe(false);
  });
});
