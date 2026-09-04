/**
 * Guard de infraestrutura para os specs do Épico 3.
 *
 * O E2E precisa de DOIS servidores de pé: a API em :3000 e o Expo Web em :8081
 * (com `EXPO_PUBLIC_USE_MOCKS=0`, `EXPO_PUBLIC_API_URL=http://localhost:3000` e
 * `EXPO_PUBLIC_E2E=1`). Subir os dois via `webServer` do Playwright provou-se
 * frágil (o bundle inicial do Expo Web leva minutos e o processo não sinaliza
 * "pronto" de forma confiável), então a suíte assume os servidores como
 * pré-requisito manual — ver `tests/README.md`.
 *
 * O spec de NFR4 vive no projeto `api` e também depende da API real — ele usa
 * `apiUnavailable()` para pular quando `:3000` está fora, em vez de estourar no
 * primeiro `POST /auth/register` da fixture de seed.
 *
 * Sem os servidores acessíveis, os specs são SKIPPADOS (não falhados): `npm run
 * test:pw:api` e o resto do gate continuam verdes numa máquina sem a infra.
 * Force a exigência com `E2E_SERVERS_UP=1` para que a ausência vire falha (CI).
 */
export const EXPO_WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:8081';
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

const PROBE_TIMEOUT_MS = 3000;

async function reachable(url: string): Promise<boolean> {
  try {
    // Timeout explícito: um socket meio-aberto (Expo Web no meio do bundle)
    // penduraria o `beforeAll` até o timeout global com uma falha opaca.
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok || res.status < 500;
  } catch {
    // Inclui o AbortError do timeout — trata como inacessível.
    return false;
  }
}

let cachedE2e: string | null | undefined;
let cachedApi: string | null | undefined;

function forceOrCache(
  message: string | null,
  cache: (v: string | null) => void,
): string | null {
  if (message !== null && process.env.E2E_SERVERS_UP === '1') {
    throw new Error(message);
  }
  cache(message);
  return message;
}

/**
 * Retorna `null` se API + Expo Web respondem; caso contrário uma mensagem
 * explicando o que falta. Com `E2E_SERVERS_UP=1`, lança em vez de retornar.
 */
export async function e2eServersUnavailable(): Promise<string | null> {
  if (cachedE2e !== undefined) return cachedE2e;

  const [apiUp, webUp] = await Promise.all([
    reachable(`${API_URL}/`),
    reachable(EXPO_WEB_URL),
  ]);

  if (apiUp && webUp) return forceOrCache(null, (v) => (cachedE2e = v));

  const missing = [
    apiUp ? null : `API (${API_URL})`,
    webUp ? null : `Expo Web (${EXPO_WEB_URL})`,
  ].filter(Boolean);
  return forceOrCache(
    `E2E do Épico 3 requer: ${missing.join(' e ')}. Ver tests/README.md.`,
    (v) => (cachedE2e = v),
  );
}

/**
 * Só a API. Para specs do projeto `api` que semeiam via endpoints reais.
 * Com `E2E_SERVERS_UP=1`, lança em vez de retornar.
 */
export async function apiUnavailable(): Promise<string | null> {
  if (cachedApi !== undefined) return cachedApi;

  const apiUp = await reachable(`${API_URL}/`);
  return forceOrCache(
    apiUp ? null : `Este spec requer a API real em ${API_URL}. Ver tests/README.md.`,
    (v) => (cachedApi = v),
  );
}
