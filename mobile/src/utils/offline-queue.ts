import { ApiClientError } from '@/services/api-error'

// Lógica da fila offline de check-in (Tier 2, architecture.md §5).
//
// Este módulo é PURO de propósito: nenhum import nativo, nenhum SQL, nenhum
// React. Todo o comportamento que importa — FIFO, backoff, teto, contagem de
// tentativas e classificação do desfecho de cada envio — vive aqui e é
// exercitado contra um fake em memória. O SQL fica em
// `@/lib/offline-queue-storage` e o agendamento em `@/hooks/use-offline-sync`.

export const MAX_QUEUE_SIZE = 500
export const MAX_ATTEMPTS = 5
const BASE_BACKOFF_MS = 1_000
export const MAX_BACKOFF_MS = 30_000

export type QueueStatus = 'pending' | 'sent' | 'failed'

export interface CheckInQueuePayload {
  studentId: string
  tripId: string
}

export interface QueuedCheckIn {
  /**
   * UUID v4 gerado no escaneamento. É simultaneamente a primary key da
   * `offline_queue` e o `X-Idempotency-Key` do POST — por isso o reenvio de um
   * item drenado é replay para o servidor, nunca uma operação nova.
   */
  id: string
  operation: 'check_in'
  payload: CheckInQueuePayload
  status: QueueStatus
  /**
   * ISO 8601 do ESCANEAMENTO, não do enfileiramento nem do dreno. Vai como
   * `occurredAt` no POST: sem ele o check-in registraria a hora em que a rede
   * voltou, e o embarque de 7h05 apareceria às 7h40.
   */
  createdAt: string
  attempts: number
  lastError: string | null
}

export interface QueueStorage {
  insert(item: QueuedCheckIn): Promise<void>
  /** FIFO estrito: ordenado por `createdAt` ascendente. */
  listPending(): Promise<QueuedCheckIn[]>
  markSent(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
  bumpAttempt(id: string, error: string): Promise<void>
  count(status: QueueStatus): Promise<number>
}

/**
 * Backoff exponencial 1s, 2s, 4s, 8s, ... com teto de 30s (architecture.md §5).
 * `attempt` é o número de tentativas JÁ gastas — depois da primeira falha o
 * próximo dreno é em 1s.
 */
export function backoffDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt))
  // 2 ** 31 já estoura o teto; limitar o expoente evita Infinity em entrada absurda.
  const raw = BASE_BACKOFF_MS * 2 ** Math.min(n - 1, 31)
  return Math.min(raw, MAX_BACKOFF_MS)
}

/**
 * O discriminante da story: só falha de TRANSPORTE vai para a fila.
 *
 * `api-client` envolve no `try` apenas o `fetch`, então um `ApiClientError` com
 * `status >= 400` é uma resposta determinística do servidor — reenviá-la mais
 * tarde só reproduziria o mesmo erro, e o motorista precisa do feedback agora.
 * `status === 0` é o timeout sintético, que É transporte.
 */
export function isTransportFailure(error: unknown): boolean {
  return !(error instanceof ApiClientError) || error.status === 0
}

/**
 * Os ÚNICOS 4xx que significam "o domínio disse não" — o servidor entendeu o
 * pedido e decidiu, então o item sai da fila como `sent`.
 *
 * É uma allowlist de propósito. Como denylist, qualquer código não enumerado
 * (`MISSING_TENANT` e `FORBIDDEN` dos guards, `HTTP_ERROR` do filtro de exceção)
 * cairia no ramo benigno e apagaria o embarque em silêncio — o oposto da
 * Boundary "nenhum item some em silêncio". Um código desconhecido pode ser
 * qualquer coisa; o desfecho seguro é ficar visível no banner.
 */
const SETTLED_CODES: ReadonlySet<string> = new Set([
  'DUPLICATE_CHECK_IN',
  'STUDENT_NOT_ALLOWED',
  'TRIP_NOT_ACTIVE',
  'DRIVER_NOT_ASSIGNED',
  'TRIP_NOT_FOUND',
  'STUDENT_NOT_FOUND',
])

export type SendOutcome =
  /** 2xx (inclusive o replay idempotente). */
  | { kind: 'accepted' }
  /** 4xx de negócio: terminal e benigno — o item sai da fila como `sent`. */
  | { kind: 'settled'; reason: string }
  /** 4xx de pedido inválido ou desconhecido: terminal e visível — sai como `failed`. */
  | { kind: 'rejected'; reason: string }
  /** 401 depois do refresh: terminal para o item e fatal para o lote. */
  | { kind: 'unauthenticated'; reason: string }
  /**
   * Transporte: volta com backoff mas NÃO consome tentativa. O teto de 5 existe
   * para conter um servidor que responde 5xx sem parar; um túnel de 20s não é
   * erro nenhum, e gastar as tentativas nele marcaria como `failed` permanente
   * justamente o embarque que a fila existe para salvar.
   */
  | { kind: 'offline'; reason: string }
  /** 5xx: conta tentativa e volta com backoff. */
  | { kind: 'retryable'; reason: string }

/**
 * Traduz o desfecho de um POST do dreno.
 *
 * Contraintuitivo de propósito: no dreno, 4xx ENCERRA o item. O contrato da
 * 3.3a coloca o replay idempotente antes das regras de negócio, então um item
 * de 7h05 drenado às 7h40 volta 201 mesmo com a viagem encerrada; e um 409
 * `DUPLICATE_CHECK_IN` quer dizer que o aluno está no ônibus — retentar só
 * gastaria as 5 tentativas para chegar ao mesmo 409.
 */
export function classifySendError(error: unknown): SendOutcome {
  if (isTransportFailure(error)) {
    const reason = error instanceof Error ? error.message : String(error)
    return { kind: 'offline', reason: reason || 'Falha de transporte' }
  }

  const apiError = error as ApiClientError
  if (apiError.status >= 500) {
    return {
      kind: 'retryable',
      reason: `${apiError.code}: ${apiError.message}`,
    }
  }

  const reason = `${apiError.code}: ${apiError.message}`
  // Sessão morta: o refresh já falhou dentro do `api-client`, que deslogou e
  // redirecionou ANTES de lançar. Todo item seguinte tomaria o mesmo 401, então
  // o desfecho não é só deste item — é o fim do lote.
  if (apiError.code === 'UNAUTHORIZED') return { kind: 'unauthenticated', reason }

  return SETTLED_CODES.has(apiError.code)
    ? { kind: 'settled', reason }
    : { kind: 'rejected', reason }
}

export type EnqueueResult =
  | { kind: 'queued'; item: QueuedCheckIn }
  /**
   * Teto de 500 atingido. Rejeita o NOVO e preserva os antigos: o antigo é um
   * embarque que já aconteceu e só existe aqui; o novo ainda pode ser reescaneado.
   */
  | { kind: 'full' }

export async function enqueueCheckIn(
  storage: QueueStorage,
  input: { id: string; studentId: string; tripId: string; scannedAt: string },
): Promise<EnqueueResult> {
  if ((await storage.count('pending')) >= MAX_QUEUE_SIZE) {
    return { kind: 'full' }
  }

  const item: QueuedCheckIn = {
    id: input.id,
    operation: 'check_in',
    payload: { studentId: input.studentId, tripId: input.tripId },
    status: 'pending',
    createdAt: input.scannedAt,
    attempts: 0,
    lastError: null,
  }
  await storage.insert(item)
  return { kind: 'queued', item }
}

/** Resolve em sucesso; rejeita com o erro cru do `api-client`. */
export type CheckInSender = (item: QueuedCheckIn) => Promise<unknown>

/** O que o dreno precisa do `boardingService` — o resto é irrelevante aqui. */
interface CheckInApi {
  checkIn(
    input: { studentId: string; tripId: string; occurredAt?: string },
    idempotencyKey: string,
  ): Promise<unknown>
}

/**
 * O registro 2xx é a ÚNICA prova de registro de embarque: um 200/201 não-JSON
 * (portal cativo, proxy quebrado) chega aqui como `undefined`/`{}` — o
 * `api-client` extrai `json.data` do envelope e `parseResponseJson` devolve
 * `{}` em corpo não-JSON. Tratado como sucesso, o dreno marcaria `sent` um
 * check-in que o servidor nunca viu (DS5). Sem os campos do registro o sender
 * REJEITA como falha de transporte: o item segue `pending` com tentativas
 * intactas e o reenvio é replay inofensivo caso o POST original tenha chegado.
 */
function isCheckInRecord(response: unknown): boolean {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof (response as { id?: unknown }).id === 'string' &&
    typeof (response as { status?: unknown }).status === 'string'
  )
}

/**
 * Traduz um item da fila no POST do dreno. Exportado por causa do teste: é aqui
 * que moram as duas garantias da NFR12 — o `occurredAt` do ESCANEAMENTO e a
 * chave de idempotência igual ao `id` do item —, e um fake de `send` escrito
 * dentro do teste afirmaria o mapeamento do próprio teste, não este.
 */
export function buildCheckInSender(api: CheckInApi): CheckInSender {
  return async (item) => {
    const record = await api.checkIn(
      {
        studentId: item.payload.studentId,
        tripId: item.payload.tripId,
        // Sem ele o servidor carimbaria a hora do dreno e o embarque de 7h05
        // apareceria às 7h40.
        occurredAt: item.createdAt,
      },
      // `id` É a chave de idempotência — por isso o reenvio é replay, nunca uma
      // operação nova, mesmo depois de um crash do app.
      item.id,
    )
    if (!isCheckInRecord(record)) {
      throw new TypeError(
        'Resposta 2xx sem registro de check-in — tratada como falha de transporte',
      )
    }
    return record
  }
}

/**
 * Dreno FIFO da `offline_queue`, um item por vez, agendado pelo backoff do
 * próprio item e antecipado quando `isOnline` volta a `true`.
 *
 * `storage` é parâmetro para permitir um fake em teste; em produção nunca é
 * passado.
 */

export type DrainStep =
  | { kind: 'idle' }
  | { kind: 'sent'; id: string }
  | { kind: 'settled'; id: string; reason: string }
  | { kind: 'failed'; id: string; reason: string }
  | {
      kind: 'retry'
      id: string
      attempts: number
      delayMs: number
      reason: string
    }
  /** Transporte caiu: o item segue `pending` com `attempts` intacto. */
  | { kind: 'offline'; id: string; reason: string }
  /** Sessão morta: encerra este item e ABORTA o lote — o resto segue `pending`. */
  | { kind: 'signed-out'; id: string; reason: string }

/** Drena EXATAMENTE um item — o mais antigo pendente. */
export async function drainNext(storage: QueueStorage, send: CheckInSender): Promise<DrainStep> {
  const [item] = await storage.listPending()
  if (!item) return { kind: 'idle' }

  let outcome: SendOutcome
  try {
    await send(item)
    outcome = { kind: 'accepted' }
  } catch (error: unknown) {
    outcome = classifySendError(error)
  }

  switch (outcome.kind) {
    case 'accepted':
      await storage.markSent(item.id)
      return { kind: 'sent', id: item.id }
    case 'settled':
      await storage.markSent(item.id)
      return { kind: 'settled', id: item.id, reason: outcome.reason }
    case 'rejected':
      await storage.markFailed(item.id, outcome.reason)
      return { kind: 'failed', id: item.id, reason: outcome.reason }
    case 'offline':
      // A linha não é tocada: nem `attempts`, nem `status`. Enquanto a rede não
      // voltar o item apenas espera.
      return { kind: 'offline', id: item.id, reason: outcome.reason }
    case 'unauthenticated':
      await storage.markFailed(item.id, outcome.reason)
      return { kind: 'signed-out', id: item.id, reason: outcome.reason }
    case 'retryable': {
      const attempts = item.attempts + 1
      // Conta a tentativa ANTES de decidir o desfecho: um item que morre na 5a
      // deve ficar gravado com `attempts = 5`, e não 4, senão a linha na tabela
      // contradiz o motivo pelo qual ela virou `failed`.
      await storage.bumpAttempt(item.id, outcome.reason)
      if (attempts >= MAX_ATTEMPTS) {
        await storage.markFailed(item.id, outcome.reason)
        return { kind: 'failed', id: item.id, reason: outcome.reason }
      }
      return {
        kind: 'retry',
        id: item.id,
        attempts,
        delayMs: backoffDelayMs(attempts),
        reason: outcome.reason,
      }
    }
  }
}

export interface DrainSummary {
  sent: number
  failed: number
  /** `null` quando não há nada a reagendar (fila vazia ou toda terminal). */
  nextDelayMs: number | null
  /**
   * Falhas de TRANSPORTE consecutivas. Só escalona o backoff até o teto de 30s e
   * por isso não é persistido: quem chama devolve o valor no dreno seguinte, e
   * qualquer resposta do servidor — inclusive um erro — zera a contagem, porque
   * respondeu significa que a rede voltou.
   */
  transportFailures: number
  steps: DrainStep[]
}

/**
 * Drena a fila inteira, um item por vez, na ordem de `createdAt`.
 *
 * Uma falha retentável INTERROMPE o lote em vez de pular para o próximo: a
 * ordem é o contrato (FIFO estrito) e, se o transporte caiu para o primeiro
 * item, cairia para todos os seguintes. Desfechos terminais (2xx, 4xx) tiram o
 * item de `pending` e o laço avança — é o que garante o término.
 */
export async function drainQueue(
  storage: QueueStorage,
  send: CheckInSender,
  options: { transportFailures?: number } = {},
): Promise<DrainSummary> {
  const summary: DrainSummary = {
    sent: 0,
    failed: 0,
    nextDelayMs: null,
    transportFailures: options.transportFailures ?? 0,
    steps: [],
  }

  // Teto de iterações: `listPending()` é relido a cada passo, então uma
  // implementação de storage que não removesse o item de `pending` giraria para
  // sempre. Barato o bastante para não valer a pena confiar.
  for (let i = 0; i < MAX_QUEUE_SIZE; i += 1) {
    const step = await drainNext(storage, send)
    if (step.kind === 'idle') break
    summary.steps.push(step)
    if (step.kind !== 'offline') summary.transportFailures = 0
    if (step.kind === 'sent' || step.kind === 'settled') summary.sent += 1
    if (step.kind === 'failed') summary.failed += 1
    if (step.kind === 'signed-out') {
      // Sem este break o laço percorreria a fila INTEIRA marcando cada item como
      // `failed` contra um 401 garantido: uma expiração de sessão apagaria todos
      // os embarques de uma vez. Os demais ficam `pending` e voltam a drenar
      // depois do próximo login.
      summary.failed += 1
      break
    }
    if (step.kind === 'retry') {
      summary.nextDelayMs = step.delayMs
      break
    }
    if (step.kind === 'offline') {
      // O backoff escalona pela contagem em memória, mas o item não paga por
      // isso: ele fica `pending` retentando no teto de 30s até a rede voltar.
      summary.transportFailures += 1
      summary.nextDelayMs = backoffDelayMs(summary.transportFailures)
      break
    }
  }

  return summary
}
