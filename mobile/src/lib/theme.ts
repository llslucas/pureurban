import { DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native'
import {
  configureFonts,
  MD3DarkTheme,
  MD3LightTheme,
  type MD3TypescaleKey,
  useTheme,
} from 'react-native-paper'

import { darkMapping, darkPalette, lightPalette } from '@/lib/palette'
import {
  fontFamily,
  fontFamilyByWeight,
  type FontWeightToken,
  motion,
  radius,
  spacing,
  typography,
  type TypographyToken,
} from '@/lib/tokens'

// Mapeamento DESIGN.md → variantes MD3. labelLarge (botões Paper) usa `label`
// 15/600, não `button` 17/700: o crescimento de texto na 6.1 fica em 1–2px e o
// botão ganha a própria escala na story de componentes.
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

// Variantes que o DESIGN não mapeia mantêm a escala MD3 e só trocam para a
// família Inter do peso MD3 (400 → Regular, 500 → Medium).
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

const custom = { spacing, radius, motion } as const

// Os papéis abaixo são os ÚNICOS sobrescritos sobre o default MD3, todos
// derivados da paleta (Story 1.11; `elevation` na 1.11b — fim do resíduo
// violeta do <Banner>/Surface). `outline`/`outlineVariant` permanecem no
// default MD3 de propósito: hairline dá ~1.36:1 no branco e não atinge o 3:1
// de borda de componente interativo (WCAG 1.4.11).
export const lightTheme = {
  ...MD3LightTheme,
  fonts,
  custom,
  colors: {
    ...MD3LightTheme.colors,
    // O background default do MD3 vazava no fundo do TextInput outlined.
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

// App travado em claro: fonts/custom aqui só mantêm o tipo AppTheme.
export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  fonts,
  custom,
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

export const useAppTheme = () => useTheme<AppTheme>()

export const navigationTheme: NavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightPalette.primary,
    background: lightPalette.surfaceSoft,
    card: lightPalette.canvas,
    text: lightPalette.text,
    border: lightPalette.hairline,
  },
  fonts: {
    regular: { fontFamily: fontFamily.regular, fontWeight: '400' },
    medium: { fontFamily: fontFamily.medium, fontWeight: '500' },
    bold: { fontFamily: fontFamily.semiBold, fontWeight: '600' },
    heavy: { fontFamily: fontFamily.bold, fontWeight: '700' },
  },
}
