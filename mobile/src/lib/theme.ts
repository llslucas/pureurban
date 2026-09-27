import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native'
import { useMemo } from 'react'
import type { ColorSchemeName, ViewStyle } from 'react-native'
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
  ELEVATION_BORDER_WIDTH,
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
function makeCustom(palette: SemanticColors, tints: StatusTints, scheme: 'light' | 'dark') {
  return {
    spacing,
    radius,
    motion,
    palette,
    tints,
    elevation: makeElevation(palette),
    layers: makeLayers(palette, scheme),
  }
}

// In dark, canvas, surfaceSoft and the level-2 shadow all read as the screen
// background, so floating surfaces (menu, dialog) and pressed rows need their
// own tone plus the hairline — the only dark tone that stands out from canvas.
// Light keeps the pre-6.14 look.
function makeLayers(palette: SemanticColors, scheme: 'light' | 'dark') {
  const overlay: ViewStyle =
    scheme === 'dark'
      ? { backgroundColor: palette.surface, borderColor: palette.hairline, borderWidth: ELEVATION_BORDER_WIDTH }
      : { backgroundColor: palette.canvas }
  return {
    overlay,
    pressed: scheme === 'dark' ? palette.surfaceStrong : palette.surfaceSoft,
    // The skeleton block is surfaceStrong; the shimmer must be lighter than it.
    shimmer: scheme === 'dark' ? palette.borderStrong : palette.canvas,
    // Spread onto <RefreshControl>: iOS reads tintColor, Android the other two.
    refresh: {
      tintColor: palette.text,
      colors: [palette.text],
      progressBackgroundColor: palette.surface,
    },
  }
}

// Roles MD3 hardcodes to its violet template, mapped onto the palette. Paper
// only renders a few of them (Snackbar reads inverse*, disabled buttons the
// container/disabled roles), but none may fall back to the template. Inverse
// roles take the OPPOSITE scheme's palette: that is what "inverse" means.
function paletteRoles(palette: SemanticColors, tints: StatusTints, inverse: SemanticColors) {
  return {
    primaryContainer: palette.surfaceStrong,
    onPrimaryContainer: palette.text,
    tertiary: palette.info,
    onTertiary: palette.onPrimary,
    tertiaryContainer: palette.surfaceStrong,
    onTertiaryContainer: palette.text,
    errorContainer: tints.error,
    onErrorContainer: palette.error,
    inverseSurface: inverse.canvas,
    inverseOnSurface: inverse.text,
    inversePrimary: inverse.link,
  }
}

// Every color role comes from the palette (Story 1.11; `elevation` in 1.11b;
// the remaining template roles in the epic 6 hardening). Only neutral overlays
// stay on the MD3 default — shadow, scrim, backdrop and the disabled alphas —
// plus `outline`/`outlineVariant` on purpose: hairline gives ~1.36:1 on white
// and misses the 3:1 of an interactive component border (WCAG 1.4.11).
export const lightTheme = {
  ...MD3LightTheme,
  fonts,
  custom: makeCustom(lightPalette, lightStatusTints, 'light'),
  colors: {
    ...MD3LightTheme.colors,
    ...paletteRoles(lightPalette, lightStatusTints, darkPalette),
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
  custom: makeCustom(darkPalette, darkStatusTints, 'dark'),
  colors: {
    ...MD3DarkTheme.colors,
    ...paletteRoles(darkPalette, darkStatusTints, lightPalette),
    // D6: botão primário em dark = branco com texto tinta.
    primary: darkPalette.primary,
    onPrimary: darkPalette.onPrimary,
    secondary: darkPalette.surfaceStrong,
    onSecondary: darkPalette.text,
    secondaryContainer: darkPalette.surfaceStrong,
    onSecondaryContainer: darkPalette.text,
    surface: darkPalette.surface,
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

/** Paper + navigation themes for the OS scheme; anything but `dark` is light. */
export function themeFor(scheme: ColorSchemeName | null | undefined): { paper: AppTheme; navigation: NavigationTheme } {
  return scheme === 'dark'
    ? { paper: darkTheme, navigation: darkNavigationTheme }
    : { paper: lightTheme, navigation: lightNavigationTheme }
}
