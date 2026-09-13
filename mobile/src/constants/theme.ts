import '@/global.css';

import { Platform } from 'react-native';

import { darkPalette, lightPalette } from '@/lib/palette';

// Cores do template Expo migradas para papéis da paleta (Story 1.11) — fonte
// única em `@/lib/palette`. Sem consumidores hoje (o tema correto é via
// `useTheme`/temas Paper), mantido por compatibilidade de API.
export const Colors = {
  light: {
    text: lightPalette.text,
    background: lightPalette.canvas,
    backgroundElement: lightPalette.surfaceSoft,
    backgroundSelected: lightPalette.surfaceStrong,
    textSecondary: lightPalette.textMuted,
  },
  dark: {
    text: darkPalette.text,
    background: darkPalette.canvas,
    backgroundElement: darkPalette.surface,
    backgroundSelected: darkPalette.surfaceStrong,
    textSecondary: darkPalette.textBody,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
