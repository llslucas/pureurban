import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native'
import { useMemo } from 'react'
import {
  configureFonts,
  MD3DarkTheme,
  MD3LightTheme,
  type MD3TypescaleKey,
  useTheme,
} from 'react-native-paper'

import {
  darkMapping,
  darkPalette,
  darkStatusTints,
  lightPalette,
  lightStatusTints,
  type SemanticColors,
  type StatusTints,
} from '@/lib/palette'
import {
  fontFamily,
  fontFamilyByWeight,
  type FontWeightToken,
  makeElevation,
  motion,
  radius,
  spacing,
  typography,
  type TypographyToken,
} from '@/lib/tokens'

// DESIGN.md → MD3 variant mapping. labelLarge (Paper buttons) uses `label`
// 15/600, not `button` 17/700: story 6.1 caps text growth at 1–2px, and buttons
// get their own scale in the component story.
const DESIGN_VARIANTS: Partial<Record<MD3TypescaleKey, TypographyToken>> = {
  displaySmall: typography.displayCount,
  headlineMedium: typography.headline,
  titleLarge: typography.titleLg,
  titleMedium: typography.title,
  bodyLarge: typography.bodyLg,
  bodyMedium: typography.body,
  labelLarge: typography.label,
  bodySmall: typography.caption,
}

// Variants DESIGN.md doesn't map keep the MD3 scale and only switch to the Inter
// family for their MD3 weight (400 → Regular, 500 → Medium).
function interVariant(key: MD3TypescaleKey) {
  const design = DESIGN_VARIANTS[key]
  if (design) return { ...design }
  const weight = MD3LightTheme.fonts[key].fontWeight as FontWeightToken
  return { fontFamily: fontFamilyByWeight[weight] ?? fontFamily.regular }
}

const typescaleKeys = Object.keys(MD3LightTheme.fonts).filter(
  (key): key is MD3TypescaleKey => key !== 'default',
)

const fonts = {
  ...configureFonts({
    config: Object.fromEntries(
      typescaleKeys.map((key) => [key, interVariant(key)]),
    ) as Partial<Record<MD3TypescaleKey, ReturnType<typeof interVariant>>>,
  }),
  default: { ...MD3LightTheme.fonts.default, fontFamily: fontFamily.regular },
}

// Per-scheme: the semantic palette, status tints and elevation presets travel
// with the Paper theme so components restyle when the OS scheme flips.
function makeCustom(palette: SemanticColors, tints: StatusTints) {
  return { spacing, radius, motion, palette, tints, elevation: makeElevation(palette) }
}

// Os papéis abaixo são os ÚNICOS sobrescritos sobre o default MD3, todos
// derivados da paleta (Story 1.11; `elevation` na 1.11b — fim do resíduo
// violeta do <Banner>/Surface). `outline`/`outlineVariant` permanecem no
// default MD3 de propósito: hairline dá ~1.36:1 no branco e não atinge o 3:1
// de borda de componente interativo (WCAG 1.4.11).
export const lightTheme = {
  ...MD3LightTheme,
  fonts,
  custom: makeCustom(lightPalette, lightStatusTints),
  colors: {
    ...MD3LightTheme.colors,
    // The MD3 default background leaked into the outlined TextInput fill.
    background: lightPalette.surfaceSoft,
    primary: lightPalette.primary,
    onPrimary: lightPalette.onPrimary,
    secondary: lightPalette.surfaceStrong,
    onSecondary: lightPalette.text,
    secondaryContainer: lightPalette.surfaceStrong,
    onSecondaryContainer: lightPalette.text,
    surface: lightPalette.surface,
    onSurface: lightPalette.text,
    onBackground: lightPalette.text,
    surfaceVariant: lightPalette.surfaceStrong,
    onSurfaceVariant: lightPalette.textMuted,
    error: lightPalette.error,
    onError: lightPalette.onPrimary,
    // Surface elevada lê `colors.elevation.level{n}` (Banner default = 1) e o
    // default MD3 é violeta — agora tons da paleta. level0 permanece o default
    // 'transparent'.
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: lightPalette.surfaceSoft,
      level2: lightPalette.surfaceSoft,
      level3: lightPalette.surfaceStrong,
      level4: lightPalette.surfaceStrong,
      level5: lightPalette.surfaceStrong,
    },
  },
}

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  fonts,
  custom: makeCustom(darkPalette, darkStatusTints),
  colors: {
    ...MD3DarkTheme.colors,
    // D6: botão primário em dark = branco com texto tinta.
    primary: darkPalette.primary,
    onPrimary: darkPalette.onPrimary,
    secondary: darkPalette.surfaceStrong,
    onSecondary: darkPalette.text,
    secondaryContainer: darkPalette.surfaceStrong,
    onSecondaryContainer: darkPalette.text,
    surface: darkPalette.canvas,
    onSurface: darkPalette.text,
    background: darkPalette.canvas,
    onBackground: darkPalette.text,
    surfaceVariant: darkPalette.surface,
    onSurfaceVariant: darkPalette.textBody,
    error: darkPalette.error,
    onError: darkPalette.onPrimary,
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      // hairline é a "borda-forte" do D6 — o único tom do vocabulário escuro
      // que eleva sobre o canvas.
      level1: darkMapping.element,
      level2: darkMapping.element,
      level3: darkMapping.hairline,
      level4: darkMapping.hairline,
      level5: darkMapping.hairline,
    },
  },
}

export type AppTheme = typeof lightTheme

// Outside a PaperProvider (screens rendered bare in tests) Paper hands back
// MD3LightTheme, which has no `custom`: fall back to the app's light theme.
export function useAppTheme(): AppTheme {
  const theme = useTheme<AppTheme>()
  return (theme as Partial<AppTheme>).custom ? theme : lightTheme
}

/** Styles derived from the active theme, rebuilt only when the theme changes. */
export function useThemedStyles<T>(factory: (theme: AppTheme) => T): T {
  const theme = useAppTheme()
  return useMemo(() => factory(theme), [factory, theme])
}

const navigationFonts: NavigationTheme['fonts'] = {
  regular: { fontFamily: fontFamily.regular, fontWeight: '400' },
  medium: { fontFamily: fontFamily.medium, fontWeight: '500' },
  bold: { fontFamily: fontFamily.semiBold, fontWeight: '600' },
  heavy: { fontFamily: fontFamily.bold, fontWeight: '700' },
}

function makeNavigationTheme(base: NavigationTheme, palette: SemanticColors): NavigationTheme {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.surfaceSoft,
      card: palette.canvas,
      text: palette.text,
      border: palette.hairline,
    },
    fonts: navigationFonts,
  }
}

export const lightNavigationTheme = makeNavigationTheme(DefaultTheme, lightPalette)
export const darkNavigationTheme = makeNavigationTheme(DarkTheme, darkPalette)

export type ColorSchemeName = 'light' | 'dark' | 'unspecified' | null | undefined

/** Paper + navigation themes for the OS scheme; anything but `dark` is light. */
export function themeFor(scheme: ColorSchemeName): { paper: AppTheme; navigation: NavigationTheme } {
  return scheme === 'dark'
    ? { paper: darkTheme, navigation: darkNavigationTheme }
    : { paper: lightTheme, navigation: lightNavigationTheme }
}

/** Legacy alias, removed once the root layout reads the theme per scheme. */
export const navigationTheme = lightNavigationTheme
