import { lightPalette } from '@/lib/palette'
import { elevation, fontFamily, motion, radius, spacing, typography } from '@/lib/tokens'

// Token pin (same pattern as the palette guard): each value pinned to the redesign
// DESIGN.md (`ux-pureurban-2026-09-26`) and EXPERIENCE.md → Microinterações.
// Changing a token? Change the doc first, and this test in the same change.

const DOCUMENTED_TYPOGRAPHY = {
  displayCount: { fontFamily: 'Inter_700Bold', fontSize: 40, fontWeight: '700', lineHeight: 44, letterSpacing: -0.5 },
  headline: { fontFamily: 'Inter_700Bold', fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.25 },
  titleLg: { fontFamily: 'Inter_700Bold', fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: 0 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 18, fontWeight: '600', lineHeight: 24, letterSpacing: 0 },
  bodyLg: { fontFamily: 'Inter_400Regular', fontSize: 17, fontWeight: '400', lineHeight: 24, letterSpacing: 0 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, fontWeight: '400', lineHeight: 22, letterSpacing: 0 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600', lineHeight: 20, letterSpacing: 0 },
  button: { fontFamily: 'Inter_700Bold', fontSize: 17, fontWeight: '700', lineHeight: 22, letterSpacing: 0 },
  caption: { fontFamily: 'Inter_500Medium', fontSize: 13, fontWeight: '500', lineHeight: 18, letterSpacing: 0 },
  overline: { fontFamily: 'Inter_700Bold', fontSize: 12, fontWeight: '700', lineHeight: 16, letterSpacing: 0.8 },
}

describe('tokens — pin contra o DESIGN.md', () => {
  it('famílias Inter por peso (nomes registrados pelo useFonts)', () => {
    expect(fontFamily).toEqual({
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semiBold: 'Inter_600SemiBold',
      bold: 'Inter_700Bold',
    })
  })

  it('typography cobre exatamente os 10 papéis documentados', () => {
    expect(typography).toEqual(DOCUMENTED_TYPOGRAPHY)
  })

  it('spacing segue a grade de 4pt e os alvos mínimos', () => {
    expect(spacing).toEqual({
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
    })
  })

  it('radius', () => {
    expect(radius).toEqual({ sm: 8, md: 12, lg: 16, xl: 24, full: 9999 })
  })

  it('elevation: tom e borda nos níveis 0–1, sombra curta só no nível 2, nível 3 chapado', () => {
    expect(elevation.level0).toEqual({ backgroundColor: lightPalette.surfaceSoft })
    expect(elevation.level1).toEqual({
      backgroundColor: lightPalette.canvas,
      borderColor: lightPalette.hairline,
      borderWidth: 1,
    })
    expect(elevation.level2).toEqual({
      backgroundColor: lightPalette.canvas,
      shadowColor: lightPalette.text,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      shadowOpacity: 0.12,
      elevation: 4,
    })
    expect(elevation.level3).toEqual({ shadowOpacity: 0, elevation: 0 })
  })

  it('motion (EXPERIENCE.md → Microinterações)', () => {
    expect(motion).toEqual({
      press: 90,
      reduced: 120,
      enter: 180,
      standard: 200,
      emphasis: 300,
      progress: 400,
      pulse: 600,
      pressScale: 0.97,
    })
  })
})
