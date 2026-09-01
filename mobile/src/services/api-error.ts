// Vive num módulo sem NENHUM import para que `instanceof ApiClientError` seja
// utilizável fora do runtime do app. `api-client.ts` arrasta `expo-router` e o
// MMKV (Nitro), que não carregam sob `jest-expo`; sem esta separação, a lógica
// pura da fila offline e o mapa de feedback do scanner só poderiam checar o erro
// por forma (`'status' in err`) — e um refactor que renomeasse o campo passaria
// verde. `api-client.ts` reexporta a classe, então nada mais precisou mudar.
export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}
