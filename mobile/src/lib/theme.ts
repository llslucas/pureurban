import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper'

import { darkPalette, lightPalette } from '@/lib/palette'
// Os papéis abaixo são os ÚNICOS sobrescritos sobre o default MD3, todos
// derivados da paleta (Story 1.11). `outline`/`outlineVariant` permanecem no
// default MD3 de propósito: hairline dá ~1.36:1 no branco e não atinge o 3:1 de
// borda de componente interativo (WCAG 1.4.11). A paleta `elevation` também
// permanece default MD3 — resíduo violeta visível só no <Banner> (defer
// registrado na story).
export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: lightPalette.primary,
    onPrimary: lightPalette.onPrimary,
    secondary: lightPalette.surfaceStrong,
    onSecondary: lightPalette.text,
    secondaryContainer: lightPalette.surfaceStrong,
    onSecondaryContainer: lightPalette.text,
    surface: lightPalette.surface,
    onSurface: lightPalette.text,
    surfaceVariant: lightPalette.surfaceStrong,
    onSurfaceVariant: lightPalette.textMuted,
    error: lightPalette.error,
    onError: lightPalette.onPrimary,
  },
}

export const darkTheme = {
  ...MD3DarkTheme,
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
    surfaceVariant: darkPalette.surface,
    onSurfaceVariant: darkPalette.textBody,
    error: darkPalette.error,
    onError: darkPalette.onPrimary,
  },
}
