// Aviso do D5/AC7: "N embarques não sincronizados" descartados no logout.
//
// Módulo de propósito SEM imports (nem storage, nem React): quem PRODUZ o aviso
// é o ciclo de vida da fila (que arrasta expo-sqlite e só se registra no boot do
// app); quem CONSOME é a tela de login, que não pode pagar o import nativo —
// qualquer teste que renderize login sem mockar expo-sqlite quebraria.

export interface DiscardNotice {
  count: number
}

type NoticeOrPromise = Promise<DiscardNotice | null> | null

let notice: NoticeOrPromise = null

/** Ciclo de vida da fila publica o resultado da purga (ou `null` se nada). */
export function setDiscardNotice(next: NoticeOrPromise): void {
  notice = next
}

/** Tela de login consome o aviso UMA vez (remount sem logout novo não repete). */
export function consumeDiscardNotice(): Promise<DiscardNotice | null> {
  const current = notice
  notice = null
  return current ?? Promise.resolve(null)
}
