import type { components } from '@/types/api'

export type QrCodePayload = components['schemas']['QrCodePayloadDto']

export function buildQrPayload(studentId: string, sessionId: string): QrCodePayload {
  return { studentId, sessionId }
}

// Ordem de chaves fixa: string idêntica para o mesmo payload ⇒ QR pixel-idêntico
// entre renders, prova visual da AC #2 (QR estático por sessão).
export function encodeQrPayload(payload: QrCodePayload): string {
  return JSON.stringify({ studentId: payload.studentId, sessionId: payload.sessionId })
}
