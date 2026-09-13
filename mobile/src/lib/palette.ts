/**
 * Fonte única das cores do app (story 1.11), derivada do DESIGN.md — a análise
 * viva do sistema Airtable. Nenhum hex de cor pode existir fora deste módulo;
 * as únicas exceções são as allowlists funcionais de `student-qr-code.tsx`
 * (quiet zone do QR) e `qr-scanner.tsx`/`(driver)/scan.tsx` (chrome de câmera),
 * fiscalizadas por `palette.guard.test.ts`. Cor nova = token novo aqui, com a
 * decisão registrada na story.
 *
 * Extensões app-only aprovadas (D2/D3) — a fonte NÃO documenta estados de
 * erro/aviso ("Known Gaps") e o ideal dela seria não precisar delas:
 * - `error` #B3261E: default MD3, já dominante no app, ~6.5:1 sobre branco (D2).
 *   O coral da fonte (#aa2d00) é superfície-assinatura full-bleed, proibido
 *   como acento pequeno — nunca cor de texto.
 * - `warning` #B26A00: par âmbar escolhido na review da 3.5b (D3). A mostarda
 *   da fonte (#d9a441) é superfície de demo-grid e falha contraste como texto
 *   (~2.2:1).
 *
 * Superfícies-assinatura (coral, forest, cream, peach, mint, yellow, mustard)
 * estão registradas mas NÃO adotadas em tela (D7): na fonte elas são
 * full-bleed, nunca acento pequeno — adotar em tela é decisão de composição,
 * story própria.
 */

// ---------------------------------------------------------------------------
// Tokens do DESIGN.md (front matter `colors:`, cópia literal)
// ---------------------------------------------------------------------------

export const designTokens = {
  primary: '#181d26',
  primaryActive: '#0d1218',
  ink: '#181d26',
  body: '#333840',
  muted: '#41454d',
  hairline: '#dddddd',
  borderStrong: '#9297a0',
  canvas: '#ffffff',
  surfaceSoft: '#f8fafc',
  surfaceStrong: '#e0e2e6',
  surfaceDark: '#181d26',
  surfaceDarkElevated: '#1d1f25',
  signatureCoral: '#aa2d00',
  signatureForest: '#0a2e0e',
  signatureCream: '#f5e9d4',
  signaturePeach: '#fcab79',
  signatureMint: '#a8d8c4',
  signatureYellow: '#f4d35e',
  signatureMustard: '#d9a441',
  onPrimary: '#ffffff',
  onDark: '#ffffff',
  link: '#1b61c9',
  linkActive: '#1a3866',
  info: '#254fad',
  infoBorder: '#458fff',
  success: '#006400',
  successBorder: '#39bf45',
  pricingInk: '#1d1f25',
} as const;

// ---------------------------------------------------------------------------
// Extensões aprovadas (D2/D3) — ver o comentário do módulo
// ---------------------------------------------------------------------------

export const appExtensions = {
  error: '#B3261E',
  warning: '#B26A00',
} as const;

/**
 * D6 — mapeamento derivado do tema escuro. A fonte documenta as superfícies
 * escuras mas não o texto corrido sobre elas; `#dddddd` (o hairline claro)
 * reaparece como texto secundário porque é o neutro claro que o DESIGN.md
 * classifica como legível sobre tinta. O botão primário em dark É branco com
 * texto tinta — espelha o `button-secondary-on-dark` documentado ("o botão
 * branco fica branco sobre superfícies escuras").
 */
export const darkMapping = {
  canvas: designTokens.surfaceDark, // #181d26
  element: designTokens.surfaceDarkElevated, // #1d1f25
  text: designTokens.onDark, // #ffffff
  textSecondary: designTokens.hairline, // #dddddd
  hairline: designTokens.muted, // #41454d
  borderStrong: designTokens.borderStrong, // #9297a0
} as const;

/**
 * Tintes de fundo de status: alpha da cor semântica sobre o canvas do tema, em
 * vez de pastéis avulsos — zero cores novas e escala com qualquer tema.
 */
export const STATUS_TINT_ALPHA = 0.12;

export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SemanticColors {
  /** Ação primária / marca. */
  primary: string;
  onPrimary: string;
  /** Piso da tela. */
  background: string;
  /** Superfície elevada (cards, headers) sobre o piso. */
  surface: string;
  /** Tom de seleção/pressão, mais forte que o piso. */
  surfaceStrong: string;
  /** Texto mais forte (títulos). */
  text: string;
  /** Texto corrido. */
  textBody: string;
  /** Legendas, hints, rótulos de apoio. */
  textMuted: string;
  hairline: string;
  borderStrong: string;
  link: string;
  info: string;
  success: string;
  warning: string;
  error: string;
  successTint: string;
  warningTint: string;
  infoTint: string;
  /** Tinte neutro (status "Não embarcou", faixa offline). */
  neutralTint: string;
}

export const lightPalette: SemanticColors = {
  primary: designTokens.primary,
  onPrimary: designTokens.onPrimary,
  background: designTokens.surfaceSoft,
  surface: designTokens.canvas,
  surfaceStrong: designTokens.surfaceStrong,
  text: designTokens.ink,
  textBody: designTokens.body,
  textMuted: designTokens.muted,
  hairline: designTokens.hairline,
  borderStrong: designTokens.borderStrong,
  link: designTokens.link,
  info: designTokens.info,
  success: designTokens.success,
  warning: appExtensions.warning,
  error: appExtensions.error,
  successTint: withAlpha(designTokens.success, STATUS_TINT_ALPHA),
  warningTint: withAlpha(appExtensions.warning, STATUS_TINT_ALPHA),
  infoTint: withAlpha(designTokens.info, STATUS_TINT_ALPHA),
  neutralTint: withAlpha(designTokens.body, STATUS_TINT_ALPHA),
};

export const darkPalette: SemanticColors = {
  // D6: primário em dark = branco com texto tinta.
  primary: darkMapping.text,
  onPrimary: designTokens.ink,
  background: darkMapping.canvas,
  surface: darkMapping.element,
  surfaceStrong: darkMapping.hairline,
  text: darkMapping.text,
  textBody: darkMapping.textSecondary,
  // A fonte não degrada texto em dark além do secundário; o muted acompanha.
  textMuted: darkMapping.textSecondary,
  hairline: darkMapping.hairline,
  borderStrong: darkMapping.borderStrong,
  link: designTokens.link,
  info: designTokens.info,
  success: designTokens.success,
  warning: appExtensions.warning,
  error: appExtensions.error,
  // rgba: o tinte deriva sobre o canvas corrente, então o mesmo alpha serve
  // nos dois temas.
  successTint: withAlpha(designTokens.success, STATUS_TINT_ALPHA),
  warningTint: withAlpha(appExtensions.warning, STATUS_TINT_ALPHA),
  infoTint: withAlpha(designTokens.info, STATUS_TINT_ALPHA),
  neutralTint: withAlpha(designTokens.body, STATUS_TINT_ALPHA),
};
