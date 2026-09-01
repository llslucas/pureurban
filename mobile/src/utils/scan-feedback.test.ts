import { ApiClientError } from '@/services/api-error'
import { MAX_QUEUE_SIZE } from '@/utils/offline-queue'
import {
  describeFailure,
  feedbackIcon,
  QUEUE_FULL_FEEDBACK,
  QUEUED_FEEDBACK,
  type ScanFeedback,
} from '@/utils/scan-feedback'

// Fecha a outra metade da open question #1 das 3.2b/3.3b: o mapa
// código-de-erro -> feedback do motorista estava inline em `scan.tsx` e nunca
// teve cobertura. Cada linha aqui é uma linha da Tabela de Verdade da 3.3b.

describe('describeFailure — códigos com feedback DISTINTO', () => {
  const expected: Record<string, Pick<ScanFeedback, 'tone' | 'title' | 'canRetry'>> = {
    DUPLICATE_CHECK_IN: { tone: 'warn', title: 'Já embarcou', canRetry: false },
    STUDENT_NOT_ALLOWED: { tone: 'error', title: 'Aluno não autorizado', canRetry: false },
    TRIP_NOT_ACTIVE: { tone: 'error', title: 'Viagem não está ativa', canRetry: false },
    DRIVER_NOT_ASSIGNED: { tone: 'error', title: 'Viagem de outro motorista', canRetry: false },
    INVALID_QR_CODE: { tone: 'error', title: 'QR code inválido', canRetry: false },
    REQUEST_TIMEOUT: { tone: 'offline', title: 'Sem conexão', canRetry: true },
    IDEMPOTENCY_KEY_CONFLICT: { tone: 'error', title: 'Erro ao registrar', canRetry: false },
    MISSING_IDEMPOTENCY_KEY: { tone: 'error', title: 'Erro ao registrar', canRetry: false },
    INVALID_IDEMPOTENCY_KEY: { tone: 'error', title: 'Erro ao registrar', canRetry: false },
  }

  // O status real de cada código, e não um 409 para todos: o mapa é indexado por
  // código, mas afirmar um status que a API nunca devolve documenta o contrato
  // errado para o próximo leitor.
  const status: Record<string, number> = {
    DUPLICATE_CHECK_IN: 409,
    STUDENT_NOT_ALLOWED: 403,
    TRIP_NOT_ACTIVE: 409,
    DRIVER_NOT_ASSIGNED: 403,
    INVALID_QR_CODE: 400,
    REQUEST_TIMEOUT: 0,
    IDEMPOTENCY_KEY_CONFLICT: 409,
    MISSING_IDEMPOTENCY_KEY: 400,
    INVALID_IDEMPOTENCY_KEY: 400,
  }

  for (const [code, shape] of Object.entries(expected)) {
    it(`traduz ${code} preservando o código no estado`, () => {
      const feedback = describeFailure(new ApiClientError(code, 'mensagem da API', status[code]))
      expect(feedback).toMatchObject({ code, ...shape })
      expect(feedback.detail.length).toBeGreaterThan(0)
    })
  }

  it('dá a IDEMPOTENCY_KEY_CONFLICT um detalhe DIFERENTE dos outros dois erros de chave', () => {
    // A AC #3 da 3.3b exige feedback distinto; dividir a mensagem com
    // MISSING/INVALID apagaria a distinção que a tabela pede.
    const conflict = describeFailure(new ApiClientError('IDEMPOTENCY_KEY_CONFLICT', '', 409))
    const missing = describeFailure(new ApiClientError('MISSING_IDEMPOTENCY_KEY', '', 400))
    expect(conflict.detail).not.toBe(missing.detail)
  })

  it('DUPLICATE_CHECK_IN é âmbar, não vermelho — o aluno ESTÁ no ônibus', () => {
    expect(describeFailure(new ApiClientError('DUPLICATE_CHECK_IN', '', 409)).tone).toBe('warn')
  })
})

describe('describeFailure — código não enumerado (linha 16 da tabela)', () => {
  it('exibe a mensagem da API e não oferece retry num 4xx', () => {
    const feedback = describeFailure(
      new ApiClientError('TRIP_NOT_FOUND', 'Viagem com id X não encontrada', 404),
    )
    expect(feedback).toEqual({
      code: 'TRIP_NOT_FOUND',
      tone: 'error',
      title: 'Erro ao registrar',
      detail: 'Viagem com id X não encontrada',
      canRetry: false,
    })
  })

  it('oferece retry em 5xx e em status 0', () => {
    expect(describeFailure(new ApiClientError('INTERNAL_ERROR', 'boom', 500)).canRetry).toBe(true)
    expect(describeFailure(new ApiClientError('UNKNOWN', 'x', 0)).canRetry).toBe(true)
  })

  it('substitui o envelope sem mensagem por um texto em português', () => {
    const feedback = describeFailure(new ApiClientError('WEIRD_CODE', '', 418))
    expect(feedback.detail).toBe('Não foi possível registrar o embarque.')
  })
})

describe('describeFailure — fallback NETWORK_ERROR', () => {
  // Tudo que não é ApiClientError é falha crua do fetch. Com a fila da 3.4b este
  // caminho só aparece quando o próprio enfileiramento falhou.
  const cases: Record<string, unknown> = {
    fetchRejeitado: new TypeError('Network request failed'),
    erroGenerico: new Error('boom'),
    stringSolta: 'algo deu errado',
    nulo: null,
    indefinido: undefined,
    objetoQualquer: { status: 500 },
  }

  for (const [name, error] of Object.entries(cases)) {
    it(`retorna NETWORK_ERROR com retry para ${name}`, () => {
      expect(describeFailure(error)).toEqual({
        code: 'NETWORK_ERROR',
        tone: 'offline',
        title: 'Sem conexão',
        detail: 'Não foi possível falar com o servidor. Tente novamente.',
        canRetry: true,
      })
    })
  }
})

describe('estados da fila offline', () => {
  it('enfileirado anuncia que foi SALVO e não oferece retry', () => {
    expect(QUEUED_FEEDBACK.code).toBe('QUEUED_OFFLINE')
    expect(QUEUED_FEEDBACK.title).toBe('Salvo — será sincronizado')
    expect(QUEUED_FEEDBACK.tone).toBe('offline')
    // Um "Tentar novamente" aqui convidaria o motorista a gerar uma SEGUNDA
    // chave para o mesmo aluno e duplicar a linha na fila.
    expect(QUEUED_FEEDBACK.canRetry).toBe(false)
  })

  it('enfileirado é visualmente um sucesso, nunca um ✕', () => {
    expect(feedbackIcon(QUEUED_FEEDBACK)).toBe('✓')
  })

  it('fila cheia informa o motorista em vez de descartar em silêncio', () => {
    expect(QUEUE_FULL_FEEDBACK.code).toBe('QUEUE_FULL')
    expect(QUEUE_FULL_FEEDBACK.tone).toBe('error')
    expect(QUEUE_FULL_FEEDBACK.canRetry).toBe(false)
    expect(QUEUE_FULL_FEEDBACK.detail).toContain(String(MAX_QUEUE_SIZE))
  })

  it('o estado enfileirado não colide com nenhum código da API', () => {
    // Se colidisse, a tela trataria uma falha real do servidor como "salvo".
    const apiCode = describeFailure(new ApiClientError(QUEUED_FEEDBACK.code, 'x', 400))
    expect(apiCode.title).toBe('Erro ao registrar')
  })
})

describe('feedbackIcon', () => {
  it('âmbar leva !, o resto leva ✕', () => {
    expect(feedbackIcon(describeFailure(new ApiClientError('DUPLICATE_CHECK_IN', '', 409)))).toBe('!')
    expect(feedbackIcon(describeFailure(new ApiClientError('STUDENT_NOT_ALLOWED', '', 403)))).toBe('✕')
    expect(feedbackIcon(describeFailure(new TypeError('offline')))).toBe('✕')
  })
})
