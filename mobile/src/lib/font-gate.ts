// Fonts never hold the boot: on error the gate opens and text falls back to the system font.
export function isFontGateOpen(loaded: boolean, error: Error | null): boolean {
  return loaded || error != null
}
