import type { MdiIconName } from '@/components/ui/mdi-icon'
import { ApiClientError } from '@/services/api-error'
import { MAX_QUEUE_SIZE } from '@/utils/offline-queue'

// Mapa código-de-erro -> feedback do motorista, extraído de `(driver)/scan.tsx`
// pela Story 3.4b. Estava inline e não exportado, então a Tabela de Verdade da
// 3.3b nunca teve cobertura (open question #1, deferred-work.md). O mapa não
// mudou na mudança de arquivo; só ganhou os dois estados da fila offline.

export type Tone = 'success' | 'warn' | 'error' | 'offline'

export interface ScanFeedback {
  /**
   * Preservado no estado, e não só traduzido em texto: sem ele o código da
   * falha não é recuperável para log nem para decidir a afordância da tela.
   * 'NETWORK_ERROR' é o sintético do fetch cru.
   */
  code: string
  tone: Tone
  title: string
  detail: string
  canRetry: boolean
}

/**
 * Traduz a falha em feedback visual, conforme a Tabela de Verdade da 3.3b.
 *
 * O `default` não é defensivo por educação: o contrato declara mais códigos do
 * que a AC #3 lista, e a Story 3.3a pode acrescentar outros. Sem ele, um código
 * novo vira overlay em branco — o motorista não saberia se embarcou ou não.
 */
export function describeFailure(error: unknown): ScanFeedback {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'DUPLICATE_CHECK_IN':
        // Âmbar, não vermelho: o aluno ESTÁ no ônibus, o objetivo do motorista
        // foi atingido. Pintar de vermelho ensina o motorista a ignorar vermelho.
        return {
          code: 'DUPLICATE_CHECK_IN',
          tone: 'warn',
          title: 'Já embarcou',
          detail: 'Este aluno já fez check-in nesta viagem.',
          canRetry: false,
        }
      case 'STUDENT_NOT_ALLOWED':
        return {
          code: 'STUDENT_NOT_ALLOWED',
          tone: 'error',
          title: 'Aluno não autorizado',
          detail: 'Este aluno não está vinculado à rota desta viagem.',
          canRetry: false,
        }
      case 'TRIP_NOT_ACTIVE':
        return {
          code: 'TRIP_NOT_ACTIVE',
          tone: 'error',
          title: 'Viagem não está ativa',
          detail: 'Inicie uma viagem antes de registrar embarques.',
          canRetry: false,
        }
      case 'DRIVER_NOT_ASSIGNED':
        return {
          code: 'DRIVER_NOT_ASSIGNED',
          tone: 'error',
          title: 'Viagem de outro motorista',
          detail: 'Você não é o responsável por esta viagem.',
          canRetry: false,
        }
      case 'INVALID_QR_CODE':
        return {
          code: 'INVALID_QR_CODE',
          tone: 'error',
          title: 'QR code inválido',
          detail: 'Peça ao aluno para abrir o QR code no app novamente.',
          canRetry: false,
        }
      case 'REQUEST_TIMEOUT':
        // Linha 15 da tabela dá um rótulo único para os dois gatilhos (rede
        // caída e timeout). O detalhe distingue; o título, não.
        return {
          code: 'REQUEST_TIMEOUT',
          tone: 'offline',
          title: 'Sem conexão',
          detail: 'O servidor demorou demais. Tente novamente.',
          canRetry: true,
        }
      // Estado 14 da tabela. A AC #3 nomeia IDEMPOTENCY_KEY_CONFLICT entre os
      // códigos que precisam de feedback DISTINTO, então ele não pode dividir a
      // mensagem com os dois códigos abaixo. O texto é o da tabela.
      case 'IDEMPOTENCY_KEY_CONFLICT':
        return {
          code: error.code,
          tone: 'error',
          title: 'Erro ao registrar',
          detail: 'Tente novamente.',
          canRetry: false,
        }
      // MISSING_IDEMPOTENCY_KEY e INVALID_IDEMPOTENCY_KEY só acontecem por bug
      // do cliente. Não há ação útil para o motorista além de repetir a leitura,
      // e reenviar a mesma chave não ajudaria — por isso `canRetry: false`.
      case 'MISSING_IDEMPOTENCY_KEY':
      case 'INVALID_IDEMPOTENCY_KEY':
        return {
          code: error.code,
          tone: 'error',
          title: 'Erro ao registrar',
          detail: 'Não foi possível registrar o embarque. Escaneie novamente.',
          canRetry: false,
        }
      default:
        return {
          code: error.code,
          tone: 'error',
          title: 'Erro ao registrar',
          // A linha 16 da tabela manda exibir a `message` da API. O fallback só
          // cobre o envelope sem mensagem — `api-client` preenche com um texto
          // em inglês nesse caso, e o motorista não deve ver isso.
          detail: error.message || 'Não foi possível registrar o embarque.',
          // Só 5xx e falhas de transporte (`status: 0`) valem retry. Um 4xx não
          // enumerado — `TRIP_NOT_FOUND`, por exemplo — é determinístico:
          // reenviar com a MESMA chave só reproduz o mesmo erro, e a linha 16 da
          // tabela não prevê botão de retry.
          canRetry: error.status >= 500 || error.status === 0,
        }
    }
  }

  // Falha crua do fetch (sem rede, DNS, servidor fora do ar). Com a fila da
  // 3.4b este caminho vira o FALLBACK: a tela só o exibe quando o próprio
  // enfileiramento falhou (banco local indisponível), e aí o reenvio manual com
  // a mesma chave é a última afordância que resta.
  return {
    code: 'NETWORK_ERROR',
    tone: 'offline',
    title: 'Sem conexão',
    detail: 'Não foi possível falar com o servidor. Tente novamente.',
    canRetry: true,
  }
}

/**
 * Desfecho feliz do modo offline: o embarque foi PERSISTIDO, não perdido.
 * `canRetry: false` de propósito — não há nada que o motorista possa fazer, e
 * um botão "Tentar novamente" o convidaria a gerar uma segunda chave para o
 * mesmo aluno.
 */
export const QUEUED_FEEDBACK: ScanFeedback = {
  code: 'QUEUED_OFFLINE',
  tone: 'offline',
  title: 'Salvo — será sincronizado',
  detail: 'Sem conexão agora. O embarque foi guardado e enviado quando a rede voltar.',
  canRetry: false,
}

/**
 * Teto de 500 atingido. O item antigo não é descartado — ele é um embarque que
 * já aconteceu e só existe na fila; o novo ainda pode ser reescaneado.
 */
export const QUEUE_FULL_FEEDBACK: ScanFeedback = {
  code: 'QUEUE_FULL',
  tone: 'error',
  title: 'Fila offline cheia',
  detail: `Há ${MAX_QUEUE_SIZE} embarques aguardando envio. Recupere a conexão antes de escanear mais.`,
  canRetry: false,
}

// Success isn't a `ScanFeedback` (it never goes through `describeFailure`), but
// the overlay reads its icon and haptic from the same table as the failures.
export type FeedbackSubject = { kind: 'success' } | (ScanFeedback & { kind?: 'failure' })

export type FeedbackHaptic = 'success' | 'warning' | 'error' | 'light'

/**
 * MDI icon of the result overlay. The queued state is a LOCAL success — the
 * failure cross would tell the driver the boarding was lost.
 */
export function feedbackIcon(subject: FeedbackSubject): MdiIconName {
  if (subject.kind === 'success') return 'check-bold'
  if (subject.code === QUEUED_FEEDBACK.code) return 'cloud-upload-outline'
  switch (subject.tone) {
    case 'warn':
      return 'alert'
    case 'offline':
      return 'cloud-off-outline'
    default:
      return 'close-thick'
  }
}

/** Haptic pattern per result, so the driver knows the outcome without looking. */
export function feedbackHaptic(subject: FeedbackSubject): FeedbackHaptic {
  if (subject.kind === 'success') return 'success'
  if (subject.code === QUEUED_FEEDBACK.code) return 'light'
  return subject.tone === 'warn' ? 'warning' : 'error'
}
