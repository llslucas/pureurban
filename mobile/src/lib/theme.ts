import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import {
  appExtensions,
  darkMapping,
  darkPalette,
  designTokens,
  lightPalette,
} from '@/lib/palette';

// Temas Paper derivados da paleta única (story 1.11). Os papéis semânticos
// mapeiam direto; os contêineres secundários usam os tons de superfície do
// DESIGN.md para não sobrar nenhum lavender/violeta do default MD3.

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: lightPalette.primary,
    onPrimary: lightPalette.onPrimary,
    secondary: designTokens.surfaceStrong,
    onSecondary: designTokens.ink,
    secondaryContainer: designTokens.surfaceStrong,
    onSecondaryContainer: designTokens.ink,
    background: designTokens.canvas,
    onBackground: designTokens.ink,
    surface: designTokens.canvas,
    onSurface: designTokens.ink,
    surfaceVariant: designTokens.surfaceStrong,
    onSurfaceVariant: lightPalette.textMuted,
    outline: lightPalette.hairline,
    outlineVariant: lightPalette.hairline,
    error: appExtensions.error,
    onError: designTokens.onPrimary,
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    // D6: botão primário em dark = branco com texto tinta.
    primary: darkPalette.primary,
    onPrimary: darkPalette.onPrimary,
    secondary: darkMapping.textSecondary,
    onSecondary: designTokens.ink,
    secondaryContainer: darkMapping.hairline,
    onSecondaryContainer: darkMapping.text,
    background: darkMapping.canvas,
    onBackground: darkMapping.text,
    surface: darkMapping.canvas,
    onSurface: darkMapping.text,
    surfaceVariant: darkMapping.element,
    onSurfaceVariant: darkMapping.textSecondary,
    outline: darkMapping.hairline,
    outlineVariant: darkMapping.hairline,
    error: appExtensions.error,
    onError: designTokens.onDark,
  },
};
