// Configuração CORS extraída do bootstrap (main.ts) para ser testável: os
// testes montam o AppModule e nunca executam main.ts — o preflight e o
// fail-fast de produção eram exatamente o tipo de coisa que só falhava no
// browser, sem teste nenhum (DS11 da retro 3).

export const DEFAULT_CORS_ORIGIN = 'http://localhost:8081';

// O alvo web do app mobile (Story 1.6) roda no dev server do Expo em
// http://localhost:8081 e chama esta API em http://localhost:3000 — origem
// diferente, logo preflight. Origem restrita por CORS_ORIGIN (lista separada
// por vírgula) em vez de liberar '*'. Ver api/.env.example.
// A porta 8081 do default é a que `npm run web` fixa no mobile; se o dev server
// subir noutra porta, é CORS_ORIGIN que precisa mudar — não a URL da API.
// X-Idempotency-Key é obrigatório no allowedHeaders: sem ele o preflight do
// check-in de embarque falha e a requisição volta 400 MISSING_IDEMPOTENCY_KEY.
// cache-control e X-Requested-With vêm do cliente SSE (react-native-sse seta
// `Cache-Control: no-cache` e `X-Requested-With: XMLHttpRequest` em toda
// conexão de stream — embarque hoje, localização no Épico 5). Nenhum dos dois
// é safelisted do CORS: sem eles no preflight o browser bloqueia o stream e o
// web fica sem realtime. Aceita é safelisted — não precisa de allowlist.
// A lista é explícita e fechada: um header novo em api-client.ts (extraHeaders)
// passa nos testes — que montam o AppModule e nunca executam este bootstrap —
// e só falha no browser. Header novo no cliente ⇒ acrescente-o aqui na mesma PR.
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Idempotency-Key',
  'cache-control',
  'X-Requested-With',
];

// O header `Origin` que o browser manda nunca tem barra final e sempre vem com
// host em minúsculas; o pacote `cors` compara por igualdade estrita. Sem
// normalizar, um CORS_ORIGIN=http://LocalHost:8081/ nunca casa e todas as
// requisições são bloqueadas sem nenhum erro do lado do servidor.
export function normalizeOrigin(entry: string): string | null {
  try {
    return new URL(entry).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveCorsOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const configured = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((entry): entry is string => entry !== null);

  // `??` não cobre CORS_ORIGIN='' nem uma lista só de vírgulas: a variável está
  // definida, o split devolve [], e `origin: []` faz o `cors` nunca emitir
  // Access-Control-Allow-Origin — todo browser bloqueado, servidor silencioso.
  if (configured.length === 0) {
    if (env.NODE_ENV === 'production') {
      // Fail-fast (AGENTS.md: CORS_ORIGIN é obrigatória em produção): subir com
      // o default de dev é subir bloqueando todo browser sem erro nenhum do
      // lado do servidor — melhor o boot falhar com erro legível.
      throw new Error(
        '[cors] CORS_ORIGIN ausente ou sem origem válida — obrigatória em produção (lista de origens separada por vírgula)',
      );
    }
    if (env.CORS_ORIGIN) {
      console.warn(
        `[cors] CORS_ORIGIN="${env.CORS_ORIGIN}" não produziu nenhuma origem válida — usando o default ${DEFAULT_CORS_ORIGIN}`,
      );
    }
    return [DEFAULT_CORS_ORIGIN];
  }

  return configured;
}
