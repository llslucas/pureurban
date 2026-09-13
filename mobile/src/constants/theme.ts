/**
 * Cores do template Expo, agora derivadas da paleta única (`@/lib/palette`,
 * story 1.11). Fonts/Spacing seguem fora do escopo da paleta.
 */

import '@/global.css';

import { Platform } from 'react-native';

import { darkPalette, lightPalette } from '@/lib/palette';

export const Colors = {
  light: {
    text: lightPalette.text,
    background: lightPalette.background,
    backgroundElement: lightPalette.surface,
    backgroundSelected: lightPalette.surfaceStrong,
    textSecondary: lightPalette.textMuted,
  },
  dark: {
    text: darkPalette.text,
    background: darkPalette.background,
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
