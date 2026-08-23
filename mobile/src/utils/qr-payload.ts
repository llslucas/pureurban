import type { components } from '@/types/api'

export type QrCodePayload = components['schemas']['QrCodePayloadDto']

// Declarado aqui, e não importado de `src/mocks/`: os mocks são dev-only e não
// entram no bundle de produção — a validação do QR precisa existir no app real.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildQrPayload(studentId: string, sessionId: string): QrCodePayload {
  return { studentId, sessionId }
}

// Ordem de chaves fixa: string idêntica para o mesmo payload ⇒ QR pixel-idêntico
// entre renders, prova visual da AC #2 (QR estático por sessão).
export function encodeQrPayload(payload: QrCodePayload): string {
  return JSON.stringify({ studentId: payload.studentId, sessionId: payload.sessionId })
}

// Par simétrico de `encodeQrPayload` — mora no mesmo arquivo de propósito, para
// que codificação e decodificação mudem juntas.
//
// Devolve `null` e NUNCA lança: a entrada é o conteúdo arbitrário de qualquer QR
// que passe na frente da câmera (URL de cartaz, vCard, Wi-Fi, lixo binário). O
// chamador traduz `null` em INVALID_QR_CODE local, sem tocar a rede — o contrato
// é explícito em que o QR bruto nunca trafega.
//
// A validação de UUID não é decorativa: o backend rejeita `studentId`/`tripId`
// malformado com 400 (`check-in.dto.ts` + o mesmo regex em `boarding.handlers.ts`).
// Filtrar aqui troca uma ida à rede por feedback instantâneo ao motorista.
export function decodeQrPayload(raw: string): QrCodePayload | null {
  if (typeof raw !== 'string' || raw.length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  // `typeof null === 'object'` e arrays também são objetos: os dois precisam de
  // guarda explícita, senão `(parsed as ...).studentId` estoura ou vira undefined.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const { studentId, sessionId } = parsed as Record<string, unknown>

  if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) return null
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return null

  // Reconstrói o objeto em vez de devolver `parsed`: um QR com campos extras não
  // pode vazar para o body do check-in.
  return { studentId, sessionId }
}
