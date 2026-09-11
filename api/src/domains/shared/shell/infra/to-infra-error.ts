import { Prisma } from '../../../../generated/prisma/client.js';

// Factory de catch para Effect.tryPromise nos adapters Prisma: devolve uma
// função (e: unknown) => Error pronta para o `catch:`. Era copiada à mão em
// cada adapter (11 cópias até o épico 4); adapters com canal de erro tipado
// do domínio (ex.: TripNotFound) passam `toError` para preservá-lo.
// P2003 é sanitizado para não vazar detalhes de FK ao log/resposta.
export const toInfraError =
  (msg: string, toError: (message: string) => Error = (m) => new Error(m)) =>
  (e: unknown): Error => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      return toError(`${msg}: FK constraint failed`);
    }
    return toError(`${msg}: ${String(e)}`);
  };
