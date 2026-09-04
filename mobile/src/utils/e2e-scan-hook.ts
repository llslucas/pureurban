// Backdoor SÓ-TESTE da tela de scan do motorista (Story 3.6).
//
// O E2E do Épico 3 roda no web e não tem câmera: registra
// `globalThis.__E2E_INJECT_SCAN__(raw)` para entregar a string bruta de um QR
// direto ao handler da tela, exercitando todo o fluxo a partir de
// `decodeQrPayload`.
//
// Gate duplo — `__DEV__` E `EXPO_PUBLIC_E2E === '1'` — porque `EXPO_PUBLIC_*`
// entra no bundle em build time; sem a env (ou num build de produção) o registro
// é no-op e nada é exposto. Extraído da tela para ser testável sem montar
// `ScanScreen` (expo-camera, router, query client).

const GLOBAL_KEY = '__E2E_INJECT_SCAN__' as const

type ScanInjector = (raw: string) => void
type E2eGlobal = typeof globalThis & { [GLOBAL_KEY]?: ScanInjector }

export function isE2eScanHookEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_E2E === '1'
  )
}

/**
 * Registra o injetor de scan quando habilitado e devolve a função de limpeza
 * (para o cleanup do `useEffect`). Fora de teste: no-op, e o cleanup também.
 *
 * `getHandler` é chamado a cada injeção — assim o backdoor sempre usa a versão
 * corrente do handler, sem se re-registrar a cada render.
 */
export function registerE2eScanHook(getHandler: () => ScanInjector): () => void {
  if (!isE2eScanHookEnabled()) return () => undefined

  const g = globalThis as E2eGlobal
  g[GLOBAL_KEY] = (raw: string) => getHandler()(raw)

  return () => {
    delete g[GLOBAL_KEY]
  }
}
