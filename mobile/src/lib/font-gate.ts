// A fonte nunca segura o boot: com erro o gate abre e o texto cai no fallback do sistema.
export function isFontGateOpen(loaded: boolean, error: Error | null): boolean {
  return loaded || error != null
}
