import { lightPalette } from '@/lib/palette'

/**
 * Vocabulário único de tipografia, spacing, radius, elevation e motion (Story 6.1).
 * Os valores vêm do DESIGN.md do redesign (`ux-pureurban-2026-09-26`) e do
 * EXPERIENCE.md → Microinterações; `tokens.test.ts` fixa cada um contra o documento.
 * Cor não vive aqui: tudo que é cor referencia um papel de `lib/palette.ts`.
 */

// As chaves são os nomes que `useFonts` registra. No Android, família custom
// não sintetiza `fontWeight` de forma confiável: cada peso é uma família própria.
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const

export type FontWeightToken = '400' | '500' | '600' | '700'

export const fontFamilyByWeight: Record<FontWeightToken, string> = {
  '400': fontFamily.regular,
  '500': fontFamily.medium,
  '600': fontFamily.semiBold,
  '700': fontFamily.bold,
}

export interface TypographyToken {
  fontFamily: string
  fontSize: number
  fontWeight: FontWeightToken
  /** Em px: o DESIGN.md dá a razão; RN exige o valor absoluto (arredondado). */
  lineHeight: number
  letterSpacing: number
}

function type(
  fontSize: number,
  fontWeight: FontWeightToken,
  lineHeightRatio: number,
  letterSpacing = 0,
): TypographyToken {
  return {
    fontFamily: fontFamilyByWeight[fontWeight],
    fontSize,
    fontWeight,
    lineHeight: Math.round(fontSize * lineHeightRatio),
    letterSpacing,
  }
}

export const typography = {
  displayCount: type(40, '700', 1.1, -0.5),
  headline: type(28, '700', 1.2, -0.25),
  titleLg: type(22, '700', 1.27),
  title: type(18, '600', 1.33),
  bodyLg: type(17, '400', 1.41),
  body: type(15, '400', 1.47),
  label: type(15, '600', 1.33),
  button: type(17, '700', 1.3),
  caption: type(13, '500', 1.38),
  overline: type(12, '700', 1.33, 0.8),
} as const satisfies Record<string, TypographyToken>

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  gutter: 16,
  sectionGap: 24,
  touchMin: 48,
  actionHeight: 56,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

// Profundidade vem de tom e borda; sombra só no nível 2 (o que flutua).
export const elevation = {
  level0: {
    backgroundColor: lightPalette.surfaceSoft,
  },
  level1: {
    backgroundColor: lightPalette.canvas,
    borderColor: lightPalette.hairline,
    borderWidth: 1,
  },
  level2: {
    backgroundColor: lightPalette.canvas,
    shadowColor: lightPalette.text,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.12,
    elevation: 4,
  },
  // Overlay full-screen do scan: cor chapada, sem sombra.
  level3: {
    shadowOpacity: 0,
    elevation: 0,
  },
} as const

/** Durações em ms (EXPERIENCE.md → Microinterações). */
export const motion = {
  press: 90,
  reduced: 120,
  enter: 180,
  standard: 200,
  emphasis: 300,
  progress: 400,
  pulse: 600,
  pressScale: 0.97,
} as const
