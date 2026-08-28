// EXPO_PUBLIC_API_URL tem precedência quando definida (ver .env.example).
// No alvo web ela é obrigatória: 10.0.2.2 é alias de emulador Android e não
// resolve no browser.
// Sem a variável, o fallback preserva o comportamento nativo:
// Android emulator: 10.0.2.2 | iOS simulator: localhost

const PRODUCTION_API_URL = 'https://api.pureurban.com'
const NATIVE_DEV_API_URL = 'http://10.0.2.2:3000'

// Barra final e espaço em volta viram `//api/v1/...`, que o Express responde 404
// e o api-client reporta como INVALID_RESPONSE — erro caro de diagnosticar.
const envApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '')

// O Expo carrega `.env` em TODOS os modos, produção inclusa (@expo/env resolve
// [.env.${mode}.local, .env.local, .env.${mode}, .env] para qualquer NODE_ENV).
// Como o README manda todo dev rodar `cp .env.example .env`, um `expo export` de
// release feito nessa máquina embutiria http://localhost:3000 no bundle — sem
// erro e sem aviso. A variável continua válida em produção (um deploy real pode
// e deve defini-la), mas um valor de host local nunca é aceito num build de
// produção: é sempre resíduo de ambiente de desenvolvimento, não configuração.
const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.0\.2\.2|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i

function resolveApiBaseUrl(): string {
  if (__DEV__) {
    return envApiUrl || NATIVE_DEV_API_URL
  }

  if (envApiUrl && LOCAL_HOST_PATTERN.test(envApiUrl)) {
    console.error(
      `[config] EXPO_PUBLIC_API_URL="${envApiUrl}" aponta para um host local e foi ignorada neste build de produção. ` +
        `Usando ${PRODUCTION_API_URL}. Provável causa: um .env de desenvolvimento presente na máquina do build.`,
    )
    return PRODUCTION_API_URL
  }

  return envApiUrl || PRODUCTION_API_URL
}

export const API_BASE_URL = resolveApiBaseUrl()
