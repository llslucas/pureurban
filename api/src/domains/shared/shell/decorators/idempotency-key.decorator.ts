import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';

// Vive no shared kernel: X-Idempotency-Key é reusado pelo Épico 4
// (not-returning, cancel-absence, broadcast — Story 4.0), não é exclusivo do boarding.
// Sem validação de formato UUID de propósito: o contrato exige apenas
// não-vazio, e recusar o que o mock aceita quebraria a integração do Épico 3.
// O limite de tamanho é outra coisa — a key entra num índice btree do Postgres,
// cujo limite de linha (~2704 bytes) transformaria uma key gigante num erro de
// infraestrutura, ou seja, 500 onde o certo é 400.
const MAX_KEY_LENGTH = 200;

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const raw = request.headers['x-idempotency-key'];
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!key) {
      throw new BadRequestException({
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Header X-Idempotency-Key é obrigatório',
      });
    }
    if (key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: `Header X-Idempotency-Key excede ${MAX_KEY_LENGTH} caracteres`,
      });
    }
    return key;
  },
);
