import { lightPalette, type SemanticColors } from '@/lib/palette'

/**
 * Single vocabulary for typography, spacing, radius, elevation and motion (story 6.1).
 * Values come from the redesign DESIGN.md (`ux-pureurban-2026-09-26`) and
 * EXPERIENCE.md → Microinterações; `tokens.test.ts` pins each one to the docs.
 * No color lives here: every color references a role from `lib/palette.ts`.
 */

// Keys are the names `useFonts` registers. Android doesn't reliably synthesize
// `fontWeight` on a custom family, so each weight is its own family.
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
  /** In px: DESIGN.md gives a ratio; RN needs the absolute (rounded) value. */
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
  contentMaxWidth: 560,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

/** Hairline border of the level-1 card, for layout math that can't read the theme. */
export const ELEVATION_BORDER_WIDTH = 1

// Depth comes from tone and border; shadow only on level 2 (floating surfaces).
// Colors come from the scheme's palette: the theme carries `custom.elevation`.
export function makeElevation(p: SemanticColors) {
  return {
    level0: {
      backgroundColor: p.surfaceSoft,
    },
    level1: {
      backgroundColor: p.canvas,
      borderColor: p.hairline,
      borderWidth: ELEVATION_BORDER_WIDTH,
    },
    level2: {
      backgroundColor: p.canvas,
      shadowColor: p.text,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      shadowOpacity: 0.12,
      // shadow* props are iOS/web-only; Android needs `elevation`.
      elevation: 4,
    },
    // Full-screen scan overlay: flat color, no shadow.
    level3: {
      shadowOpacity: 0,
      elevation: 0,
    },
  } as const
}

// Fixed-identity surfaces (the QR pass) keep the light look in both schemes.
export const lightElevation = makeElevation(lightPalette)

/** Legacy alias, removed once every consumer reads elevation from the theme. */
export const elevation = lightElevation

/** Durations in ms plus the press scale factor (EXPERIENCE.md → Microinterações). */
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
