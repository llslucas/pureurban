import { Effect, Runtime, TestClock, TestContext } from 'effect';

// O build do TestContext e o próprio TestClock.setTime são caros (~5ms cada):
// o Runtime é capturado UMA vez por módulo de teste e o relógio só é reajustado
// quando o `now` pedido difere do instante corrente — cada `it` declara o
// instante em que roda e o estado persiste entre runs no mesmo Runtime.
// Usado pelos specs de use cases do core com relógio injetado (padrão da 4.3).
export const createTestClock = () => {
  const testRuntimePromise: Promise<Runtime.Runtime<never>> = Effect.runPromise(
    Effect.runtime<never>().pipe(Effect.provide(TestContext.TestContext)),
  );
  let clockNowMs = Number.NaN;
  return {
    runtime: () => testRuntimePromise,
    setClock: async (now: Date) => {
      if (now.getTime() === clockNowMs) return;
      const runtime = await testRuntimePromise;
      await Runtime.runPromise(runtime)(TestClock.setTime(now));
      clockNowMs = now.getTime();
    },
  };
};
