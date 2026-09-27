/**
 * Fonte única de cor do app (Story 1.11). Os tokens vêm do DESIGN.md, na raiz do
 * repositório — análise do sistema Airtable; consulte-o antes de adicionar ou
 * alterar qualquer valor. Nenhum hex semântico pode viver fora deste módulo:
 * `palette.guard.test.ts` falha em qualquer hex/rgba() em `src/` que não esteja
 * na allowlist documentada (quiet zone do QR e chrome de câmera).
 *
 * As extensões além do DESIGN.md são as duas aprovadas na matriz D1–D7 da story,
 * erro (D2) e aviso (D3), mais o erro on-dark da Story 6.14. Nova cor = nova
 * entrada aqui com decisão registrada.
 */

/** Alfa dos tintes de fundo de status (chips/faixas): 12% da cor base. */
export const STATUS_TINT_ALPHA = 0.12

/** Hex `#RGB`/`#RRGGBB` → string `rgba()` aceita pelo StyleSheet. */
export function withAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  const full = (raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw).toLowerCase()
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Tokens de cor do DESIGN.md (seção `colors:` do front matter), 1:1 — o teste
 * de guarda fixa cada valor contra o documento (token-pin).
 */
export const designTokens = {
  // Brand & accent
  primary: '#181d26',
  primaryActive: '#0d1218',
  // Text
  ink: '#181d26',
  body: '#333840',
  muted: '#41454d',
  // Surface
  hairline: '#dddddd',
  borderStrong: '#9297a0',
  canvas: '#ffffff',
  surfaceSoft: '#f8fafc',
  surfaceStrong: '#e0e2e6',
  surfaceDark: '#181d26',
  surfaceDarkElevated: '#1d1f25',
  // On-colors
  onPrimary: '#ffffff',
  onDark: '#ffffff',
  // Semantic
  link: '#1b61c9',
  linkActive: '#1a3866',
  info: '#254fad',
  infoBorder: '#458fff',
  success: '#006400',
  // ~2.4:1 no branco: abaixo do gate não-texto (3:1, WCAG 1.4.11) da própria
  // story — como borda de componente em superfície clara, exige decisão registrada.
  successBorder: '#39bf45',
  pricingInk: '#1d1f25',
  // Signature card surfaces (D7). Only yellow is adopted, full-bleed (D-UX-1,
  // `brand` role); the rest stay registered but unused. Never a small accent.
  signatureCoral: '#aa2d00',
  signatureForest: '#0a2e0e',
  signatureCream: '#f5e9d4',
  signaturePeach: '#fcab79',
  signatureMint: '#a8d8c4',
  signatureYellow: '#f4d35e',
  signatureMustard: '#d9a441',
} as const

/**
 * Extensões app-only (matriz D1–D7 da Story 1.11) — papéis que o DESIGN.md não
 * documenta ("Known Gaps" de estados de formulário):
 *
 * - error (D2): `#B3261E`, default MD3 já dominante no app; único vermelho.
 *   Contraste 6.4:1 sobre branco (valor frozen; cômputo fino ~6.5). Extensão
 *   app-only até a fonte extrair estados de erro de formulário.
 * - warning (D3): `#B26A00`, par âmbar escolhido na Story 3.5b. RENEGOCIADO no
 *   loopback de 13/09/2026: piso 3:1 (AA texto grande/UI) para badges/overlays —
 *   ~4.24:1 sobre branco e ~3.67:1 sobre o próprio tinte, abaixo do 4.5:1 de
 *   texto normal por decisão deliberada (matriz frozen D3).
 * - errorOnDark (Story 6.14): `#f2b8b5`, o erro baseline do MD3 dark. Único hex
 *   novo do consumo do tema escuro: nenhum token registrado é um vermelho legível
 *   sobre o canvas escuro (~9.9:1 sobre `#181d26`). Os demais papéis on-dark
 *   reusam tokens do DESIGN.md.
 */
export const appExtensions = {
  error: '#B3261E',
  warning: '#B26A00',
  errorOnDark: '#f2b8b5',
} as const

/**
 * Mapeamento do tema escuro (D6) — derivado dos tokens acima (nenhum hex novo):
 * as superfícies escuras do DESIGN.md viram o vocabulário de fundo, e o botão
 * primário vira BRANCO com texto tinta (espelha o `button-secondary-on-dark`
 * documentado — "o botão branco fica branco sobre superfícies escuras").
 */
export const darkMapping = {
  canvas: designTokens.surfaceDark,
  element: designTokens.surfaceDarkElevated,
  text: designTokens.onDark,
  // "Secundário" do D6 é TEXTO secundário (#dddddd); a chave `secondary` do tema
  // Paper é OUTRA coisa (superfície) — ver lib/theme.ts.
  textSecondary: designTokens.hairline,
  hairline: designTokens.muted,
  borderStrong: designTokens.borderStrong,
} as const

/** Papéis semânticos consumidos por telas e pelos temas Paper. */
export interface SemanticColors {
  primary: string
  onPrimary: string
  canvas: string
  /** Cards e barras (superfície elevada sobre o canvas). */
  surface: string
  /** Fundo de telas (era o `#F5F5F5` avulso). */
  surfaceSoft: string
  /** Superfície de maior ênfase (chave `secondary` do tema Paper). */
  surfaceStrong: string
  /** Títulos (ink). */
  text: string
  /** Texto corrido (body). */
  textBody: string
  /** Legendas/hints/labels (muted). */
  textMuted: string
  hairline: string
  borderStrong: string
  success: string
  successBorder: string
  warning: string
  error: string
  link: string
  linkActive: string
  info: string
  infoBorder: string
  /** Full-bleed brand surface (D-UX-1): splash, icon, login hero, QR pass. Never text, border or chip. */
  brand: string
  /** Text/icon on `brand`. */
  onBrand: string
}

export const lightPalette: SemanticColors = {
  primary: designTokens.primary,
  onPrimary: designTokens.onPrimary,
  canvas: designTokens.canvas,
  surface: designTokens.canvas,
  surfaceSoft: designTokens.surfaceSoft,
  surfaceStrong: designTokens.surfaceStrong,
  text: designTokens.ink,
  textBody: designTokens.body,
  textMuted: designTokens.muted,
  hairline: designTokens.hairline,
  borderStrong: designTokens.borderStrong,
  success: designTokens.success,
  successBorder: designTokens.successBorder,
  warning: appExtensions.warning,
  error: appExtensions.error,
  link: designTokens.link,
  linkActive: designTokens.linkActive,
  info: designTokens.info,
  infoBorder: designTokens.infoBorder,
  brand: designTokens.signatureYellow,
  onBrand: designTokens.ink,
}

// D6 define só dois tons de texto no escuro: `textBody` e `textMuted` colapsam
// no `textSecondary` de propósito. Os papéis de status/link/info são as
// variantes on-dark da Story 6.14, todas ≥ 4.5:1 sobre canvas e surface escuros
// (travado na guarda): tokens já registrados, exceto o erro (`errorOnDark`). O
// mostarda resolve no escuro o piso 3:1 que o âmbar claro tem (D3).
export const darkPalette: SemanticColors = {
  // Botão primário em dark = branco com texto tinta (D6).
  primary: darkMapping.text,
  onPrimary: darkMapping.canvas,
  canvas: darkMapping.canvas,
  surface: darkMapping.element,
  // Screens take the darkest tone so level-1 cards (canvas + hairline) sit flush
  // and `surface` rows lift slightly above; matches Paper's dark background.
  surfaceSoft: darkMapping.canvas,
  surfaceStrong: darkMapping.hairline,
  text: darkMapping.text,
  textBody: darkMapping.textSecondary,
  textMuted: darkMapping.textSecondary,
  hairline: darkMapping.hairline,
  borderStrong: darkMapping.borderStrong,
  success: designTokens.successBorder,
  successBorder: designTokens.successBorder,
  warning: designTokens.signatureMustard,
  error: appExtensions.errorOnDark,
  link: designTokens.infoBorder,
  linkActive: darkMapping.text,
  info: designTokens.infoBorder,
  infoBorder: designTokens.infoBorder,
  brand: designTokens.signatureYellow,
  onBrand: designTokens.ink,
}

export interface StatusTints {
  success: string
  warning: string
  error: string
  info: string
  /** Neutro da família ink/body (era o slate `#ECEFF1` do template). */
  neutral: string
}

/**
 * Fundos de status derivados por alpha da cor base (zero pastéis avulsos):
 * tinte 12% do próprio papel, por esquema — no escuro, da variante on-dark.
 */
export function makeStatusTints(p: SemanticColors): StatusTints {
  return {
    success: withAlpha(p.success, STATUS_TINT_ALPHA),
    warning: withAlpha(p.warning, STATUS_TINT_ALPHA),
    error: withAlpha(p.error, STATUS_TINT_ALPHA),
    info: withAlpha(p.info, STATUS_TINT_ALPHA),
    neutral: withAlpha(p.textBody, STATUS_TINT_ALPHA),
  }
}

export const lightStatusTints = makeStatusTints(lightPalette)
export const darkStatusTints = makeStatusTints(darkPalette)
