import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import React, { createElement } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper'
import { render, screen, cleanup } from '@testing-library/react-native'

import { OfflineBanner } from '@/components/offline-banner'
import { STATUS_PRESENTATION, StudentCard } from '@/components/student-card'
import {
  appExtensions,
  darkMapping,
  darkPalette,
  designTokens,
  lightPalette,
  STATUS_TINT_ALPHA,
  statusTints,
} from '@/lib/palette'
import { darkTheme, lightTheme, navigationTheme } from '@/lib/theme'
import { fontFamily, typography } from '@/lib/tokens'
import type { BoardingStatus, TripStudentItem } from '@/services/trip.service'

// Tranca a paleta única da Story 1.11 por quatro camadas:
// (1) nenhuma cor fora de `lib/palette.ts` — hex #RGB/#RRGGBB/#RRGGBBAA e
//     chamadas rgb()/rgba(), com allowlist comentada e checagem de entrada morta;
// (2) token-pin — cada valor de designTokens/appExtensions/darkMapping fixado ao
//     hex documentado no DESIGN.md / matriz D1–D7 (drift contrast-safe fica
//     visível: trocar error → outro vermelho passa no contraste, mas falha aqui);
// (3) contraste — pares texto×fundo dos dois temas em AA (âmbar no piso 3:1,
//     renegociado no loopback de 13/09/2026 — D3) + gate não-texto de borda;
// (4) locks de binding — os papéis sobrescritos dos temas Paper (incluída a
//     `elevation`, 1.11b; fundo, fontes, marca e tema de navegação, 6.1) e o
//     provider travado em lightTheme no _layout, o mapa de status do StudentCard, as faixas do OfflineBanner e os
//     call-sites das telas presos aos papéis da paleta (a migração manual não
//     pode trocar tokens silenciosamente).
// O próprio arquivo de teste e o módulo de paleta são as únicas exclusões da
// varredura: o teste contém os hexes de referência por definição.

const SRC_ROOT = join(__dirname, '..')
const PALETTE_MODULE = 'lib/palette.ts'
const GUARD_TEST = 'lib/palette.guard.test.ts'

function walkSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkSourceFiles(full))
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      // Normaliza para `/`: a ALLOWLIST é POSIX e `relative()` devolve o
      // separador do SO (quebra a lookup no Windows).
      const rel = relative(SRC_ROOT, full).split(sep).join('/')
      if (rel !== PALETTE_MODULE && rel !== GUARD_TEST) out.push(rel)
    }
  }
  return out.sort()
}

// ---- (1) Guarda de alcance ----

const HEX_REGEX = /#[0-9a-fA-F]{3,8}\b/g
const RGB_FUNC_REGEX = /\brgba?\([^()]*\)/g

const normalizeColor = (value: string) => value.toLowerCase().replace(/\s+/g, '')

function colorOccurrences(source: string): { value: string; line: number }[] {
  const out: { value: string; line: number }[] = []
  for (const regex of [HEX_REGEX, RGB_FUNC_REGEX]) {
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(source)) !== null) {
      out.push({ value: normalizeColor(match[0]), line: source.slice(0, match.index).split('\n').length })
    }
  }
  return out
}

// Allowlist da guarda — cada entrada com o porquê. Nova entrada exige decisão
// registrada na story (o default é resolver na paleta).
const ALLOWLIST: Record<string, { value: string; why: string }[]> = {
  // Quiet zone do QR: branco e preto PUROS são requisito óptico de leitura
  // (borda de silêncio + módulos de máximo contraste) — não são cores de UI.
  'components/student-qr-code.tsx': [
    { value: '#ffffff', why: 'quiet zone do QR (leitura óptica), não cor de UI' },
    { value: '#000000', why: 'módulos do QR (leitura óptica), não cor de UI' },
  ],
  // Chrome da câmera do scanner: viewfinder, máscara e cantos de alto contraste.
  'components/qr-scanner.tsx': [
    { value: '#000000', why: 'fundo do viewfinder — chrome de câmera' },
    { value: 'rgba(0,0,0,0.6)', why: 'máscara escura ao redor da janela de leitura — chrome de câmera' },
    { value: '#ffffff', why: 'cantos da moldura sob sol direto (NFR18) — chrome de câmera' },
  ],
  // Chrome da câmera na tela de scan: fundos preto puro da câmera/tela fora de
  // foco, scrim do contador e botão translúcido sobre o viewfinder. A paleta do
  // DESIGN.md não tem preto puro.
  'app/(driver)/scan.tsx': [
    { value: '#000000', why: 'fundo da câmera/offscreen — chrome de câmera' },
    { value: 'rgba(0,0,0,0.55)', why: 'scrim do contador sobre a câmera — chrome de câmera' },
    { value: 'rgba(255,255,255,0.16)', why: 'botão translúcido sobre o viewfinder — chrome de câmera' },
  ],
  // Botão "Dispensar" sobre a faixa vermelha de falha: branco 92% para o rótulo
  // ter contraste — overlay funcional, não papel do tema.
  'components/offline-banner.tsx': [
    { value: 'rgba(255,255,255,0.92)', why: 'fundo do botão Dispensar sobre a faixa de falha' },
  ],
}

// ---- (2) Token-pin ----

const DOCUMENTED_TOKENS: Record<keyof typeof designTokens, string> = {
  primary: '#181d26',
  primaryActive: '#0d1218',
  ink: '#181d26',
  body: '#333840',
  muted: '#41454d',
  hairline: '#dddddd',
  borderStrong: '#9297a0',
  canvas: '#ffffff',
  surfaceSoft: '#f8fafc',
  surfaceStrong: '#e0e2e6',
  surfaceDark: '#181d26',
  surfaceDarkElevated: '#1d1f25',
  onPrimary: '#ffffff',
  onDark: '#ffffff',
  link: '#1b61c9',
  linkActive: '#1a3866',
  info: '#254fad',
  infoBorder: '#458fff',
  success: '#006400',
  successBorder: '#39bf45',
  pricingInk: '#1d1f25',
  signatureCoral: '#aa2d00',
  signatureForest: '#0a2e0e',
  signatureCream: '#f5e9d4',
  signaturePeach: '#fcab79',
  signatureMint: '#a8d8c4',
  signatureYellow: '#f4d35e',
  signatureMustard: '#d9a441',
}

const DOCUMENTED_EXTENSIONS: Record<keyof typeof appExtensions, string> = {
  error: '#B3261E', // D2 — único vermelho
  warning: '#B26A00', // D3 — âmbar 3.5b, piso 3:1 (loopback 13/09/2026)
}

const DOCUMENTED_DARK_MAPPING: Record<keyof typeof darkMapping, string> = {
  canvas: '#181d26', // D6
  element: '#1d1f25',
  text: '#ffffff',
  textSecondary: '#dddddd',
  hairline: '#41454d',
  borderStrong: '#9297a0',
}

// ---- (3) Contraste ----

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

// Aceita hex e strings rgb()/rgba() (os defaults do Paper vêm como rgba()).
function colorToRgb(color: string): Rgb {
  const value = color.trim().toLowerCase()
  if (value.startsWith('#')) return hexToRgb(value)
  const match = value.match(/^rgba?\(([^)]+)\)$/)
  if (!match) throw new Error(`cor não-parseável para o teste: ${color}`)
  const parts = match[1].split(',').map((p) => parseFloat(p.trim()))
  return [parts[0], parts[1], parts[2]]
}

function channel(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratioPair(la: number, lb: number): number {
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function contrastHexes(a: string, b: string): number {
  return ratioPair(luminance(colorToRgb(a)), luminance(colorToRgb(b)))
}

// Tinte rgba() (saída de withAlpha) composto sobre o canvas.
function contrastOverTint(fgHex: string, tint: string, canvasHex: string): number {
  const alpha = parseFloat(tint.slice(tint.lastIndexOf(',') + 1))
  const tintRgb = colorToRgb(tint)
  const canvas = colorToRgb(canvasHex)
  const bg: Rgb = [
    tintRgb[0] * alpha + canvas[0] * (1 - alpha),
    tintRgb[1] * alpha + canvas[1] * (1 - alpha),
    tintRgb[2] * alpha + canvas[2] * (1 - alpha),
  ]
  return ratioPair(luminance(colorToRgb(fgHex)), luminance(bg))
}

function pairRatio(fg: string, bg: string): number {
  return bg.startsWith('#') ? contrastHexes(fg, bg) : contrastOverTint(fg, bg, lightPalette.canvas)
}

interface ColorPair {
  desc: string
  fg: string
  bg: string
  min: number
  note?: string
}

const AMBER_NOTE = 'D3: piso 3:1 (AA texto grande/UI) renegociado no loopback de 13/09/2026 para badges/overlays'

const LIGHT_PAIRS: ColorPair[] = [
  { desc: 'títulos (ink) × canvas', fg: lightPalette.text, bg: lightPalette.canvas, min: 4.5 },
  { desc: 'títulos (ink) × surface-soft', fg: lightPalette.text, bg: lightPalette.surfaceSoft, min: 4.5 },
  { desc: 'texto corrido (body) × canvas', fg: lightPalette.textBody, bg: lightPalette.canvas, min: 4.5 },
  { desc: 'legendas (muted) × canvas', fg: lightPalette.textMuted, bg: lightPalette.canvas, min: 4.5 },
  { desc: 'onPrimary × botão primário (tinta)', fg: lightPalette.onPrimary, bg: lightPalette.primary, min: 4.5 },
  { desc: 'erro × canvas', fg: lightPalette.error, bg: lightPalette.canvas, min: 4.5 },
  { desc: 'onSurfaceVariant × surfaceVariant (chips/labels Paper)', fg: lightPalette.textMuted, bg: lightPalette.surfaceStrong, min: 4.5 },
  { desc: 'títulos (ink) × superfície elevada (elevation 3–5)', fg: lightPalette.text, bg: lightPalette.surfaceStrong, min: 4.5 },
  { desc: 'sucesso × tinte de sucesso', fg: lightPalette.success, bg: statusTints.success, min: 4.5 },
  { desc: 'info × tinte de info (chip Concluída)', fg: lightPalette.info, bg: statusTints.info, min: 4.5 },
  { desc: 'erro × tinte de erro', fg: lightPalette.error, bg: statusTints.error, min: 4.5 },
  { desc: 'body × tinte neutro (chip Não embarcou)', fg: lightPalette.textBody, bg: statusTints.neutral, min: 4.5 },
  { desc: 'aviso × tinte de aviso (chip Não vai voltar)', fg: lightPalette.warning, bg: statusTints.warning, min: 3, note: AMBER_NOTE },
  { desc: 'aviso × superfície clara (texto âmbar sobre botão branco do overlay)', fg: lightPalette.warning, bg: lightPalette.onPrimary, min: 3, note: AMBER_NOTE },
  { desc: 'onPrimary × overlay de sucesso', fg: lightPalette.onPrimary, bg: lightPalette.success, min: 4.5 },
  { desc: 'onPrimary × overlay de aviso', fg: lightPalette.onPrimary, bg: lightPalette.warning, min: 3, note: AMBER_NOTE },
  { desc: 'onPrimary × overlay de erro', fg: lightPalette.onPrimary, bg: lightPalette.error, min: 4.5 },
  { desc: 'onPrimary × overlay Verificando (tinta)', fg: lightPalette.onPrimary, bg: lightPalette.primary, min: 4.5 },
  { desc: 'onPrimary × faixa offline (body)', fg: lightPalette.onPrimary, bg: lightPalette.textBody, min: 4.5 },
  { desc: 'onBrand × brand (superfície full-bleed, D-UX-1)', fg: lightPalette.onBrand, bg: lightPalette.brand, min: 4.5 },
]

const DARK_PAIRS: ColorPair[] = [
  { desc: 'texto × canvas escuro', fg: darkPalette.text, bg: darkPalette.canvas, min: 4.5 },
  { desc: 'texto secundário × canvas escuro', fg: darkPalette.textBody, bg: darkPalette.canvas, min: 4.5 },
  { desc: 'texto × elemento escuro', fg: darkPalette.text, bg: darkPalette.surface, min: 4.5 },
  { desc: 'texto secundário × elemento escuro', fg: darkPalette.textBody, bg: darkPalette.surface, min: 4.5 },
  { desc: 'onPrimary × botão primário branco em dark', fg: darkPalette.onPrimary, bg: darkPalette.primary, min: 4.5 },
  { desc: 'onSurfaceVariant × surfaceVariant em dark', fg: darkPalette.textBody, bg: darkPalette.surfaceStrong, min: 4.5 },
  { desc: 'texto × superfície elevada (elevation 3–5 em dark)', fg: darkPalette.text, bg: darkPalette.surfaceStrong, min: 4.5 },
  { desc: 'onBrand × brand em dark', fg: darkPalette.onBrand, bg: darkPalette.brand, min: 4.5 },
]

// ---- Helpers dos render-probes ----

function makeStudent(status: BoardingStatus): TripStudentItem {
  return { studentId: 'probe-student', name: 'Ana Probe', status, checkedInAt: null }
}

interface ChipColors {
  color?: string
  background?: string
}

function chipColorsFor(status: BoardingStatus): ChipColors {
  // createElement em vez de JSX: o arquivo é `.ts` (nome registrado na story),
  // e JSX exigiria a extensão `.tsx`.
  const utils = render(createElement(StudentCard, { student: makeStudent(status) }))
  const label = utils.getByText(new RegExp(STATUS_PRESENTATION[status].label))
  const labelStyle = StyleSheet.flatten(label.props.style)
  // Sobe na árvore até o ancestral com backgroundColor (o chip): o pai direto
  // do Text não é garantidamente o View do chip no renderer de teste.
  let node = label.parent
  let background: string | undefined
  while (node && background === undefined) {
    const flat = node.props?.style ? StyleSheet.flatten(node.props.style) : undefined
    const color = flat?.backgroundColor as string | undefined
    if (color) {
      background = color
      break
    }
    node = node.parent
  }
  cleanup()
  return { color: labelStyle?.color as string | undefined, background }
}

type JsonNode = { type?: string; props?: { style?: unknown }; children?: unknown[] } | null

function allBackgroundsOf(element: React.ReactElement): string[] {
  const { toJSON } = render(element)
  const out: string[] = []
  const visit = (node: JsonNode) => {
    if (!node) return
    if (node.type === 'View' && node.props?.style) {
      const flat = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)
      if (flat?.backgroundColor) out.push(String(flat.backgroundColor))
    }
    for (const child of node.children ?? []) visit(child as JsonNode)
  }
  visit(toJSON() as JsonNode)
  cleanup()
  return out
}

const readSource = (rel: string) => readFileSync(join(SRC_ROOT, rel), 'utf8')

// ---- Suíte ----

describe('guarda — nenhuma cor fora do módulo de paleta', () => {
  it('todo hex/rgb() em src/ está na paleta ou na allowlist (falha apontando arquivo:linha)', () => {
    const offenders: string[] = []
    for (const file of walkSourceFiles(SRC_ROOT)) {
      const allowed = new Set((ALLOWLIST[file] ?? []).map((entry) => entry.value))
      for (const { value, line } of colorOccurrences(readSource(file))) {
        if (!allowed.has(value)) offenders.push(`${file}:${line} → ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('a allowlist não tem entrada morta (todo valor permitido ainda ocorre no arquivo)', () => {
    for (const [file, entries] of Object.entries(ALLOWLIST)) {
      const values = colorOccurrences(readSource(file)).map((o) => o.value)
      for (const entry of entries) {
        const found = values.includes(entry.value)
        expect(found ? 'ok' : `${file}: entrada morta da allowlist (${entry.why})`).toBe('ok')
      }
    }
  })

  it('a allowlist só aponta para arquivos que existem em src/', () => {
    const files = new Set(walkSourceFiles(SRC_ROOT))
    for (const file of Object.keys(ALLOWLIST)) {
      expect(files.has(file) ? 'ok' : `allowlist aponta para arquivo inexistente: ${file}`).toBe('ok')
    }
  })
})

describe('token-pin — valores fixados ao DESIGN.md e à matriz D1–D7', () => {
  it('designTokens cobre exatamente os tokens documentados, com o hex documentado', () => {
    expect(Object.keys(designTokens).sort()).toEqual(Object.keys(DOCUMENTED_TOKENS).sort())
    for (const [key, expected] of Object.entries(DOCUMENTED_TOKENS)) {
      expect(designTokens[key as keyof typeof designTokens]).toBe(expected)
    }
  })

  it('extensões D2/D3 mantêm os hexes aprovados', () => {
    expect(Object.keys(appExtensions).sort()).toEqual(Object.keys(DOCUMENTED_EXTENSIONS).sort())
    for (const [key, expected] of Object.entries(DOCUMENTED_EXTENSIONS)) {
      expect(appExtensions[key as keyof typeof appExtensions]).toBe(expected)
    }
  })

  it('darkMapping D6 mantém os hexes derivados aprovados', () => {
    expect(Object.keys(darkMapping).sort()).toEqual(Object.keys(DOCUMENTED_DARK_MAPPING).sort())
    for (const [key, expected] of Object.entries(DOCUMENTED_DARK_MAPPING)) {
      expect(darkMapping[key as keyof typeof darkMapping]).toBe(expected)
    }
  })

  it('tinte de status usa o alfa congelado de 12%', () => {
    expect(STATUS_TINT_ALPHA).toBe(0.12)
    expect(statusTints.success).toBe('rgba(0, 100, 0, 0.12)')
    expect(statusTints.warning).toBe('rgba(178, 106, 0, 0.12)')
    expect(statusTints.error).toBe('rgba(179, 38, 30, 0.12)')
    expect(statusTints.info).toBe('rgba(37, 79, 173, 0.12)')
    expect(statusTints.neutral).toBe('rgba(51, 56, 64, 0.12)')
  })
})

describe('contraste AA dos pares dos temas', () => {
  for (const pair of [...LIGHT_PAIRS, ...DARK_PAIRS]) {
    const theme = LIGHT_PAIRS.includes(pair) ? 'claro' : 'escuro'
    it(`${theme}: ${pair.desc} ≥ ${pair.min}:1${pair.note ? ` — ${pair.note}` : ''}`, () => {
      expect(pairRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min)
    })
  }

  it('gate não-texto: outline do tema é o default MD3 e mantém ≥3:1 sobre o canvas (WCAG 1.4.11)', () => {
    expect(lightTheme.colors.outline).toBe(MD3LightTheme.colors.outline)
    expect(contrastHexes(MD3LightTheme.colors.outline, lightPalette.canvas)).toBeGreaterThanOrEqual(3)
    expect(darkTheme.colors.outline).toBe(MD3DarkTheme.colors.outline)
    expect(contrastHexes(MD3DarkTheme.colors.outline, darkPalette.canvas)).toBeGreaterThanOrEqual(3)
  })
})

describe('lock de binding dos temas Paper', () => {
  it('brand é o amarelo-escolar com texto tinta, igual nos dois temas (D-UX-1)', () => {
    for (const palette of [lightPalette, darkPalette]) {
      expect(palette.brand).toBe(designTokens.signatureYellow)
      expect(palette.onBrand).toBe(designTokens.ink)
    }
  })

  it('lightTheme mapeia cada papel sobrescrito ao papel da paleta (secondary é SUPERFÍCIE, não texto)', () => {
    expect(lightTheme.colors.primary).toBe(lightPalette.primary)
    expect(lightTheme.colors.onPrimary).toBe(lightPalette.onPrimary)
    expect(lightTheme.colors.secondary).toBe(lightPalette.surfaceStrong)
    expect(lightTheme.colors.onSecondary).toBe(lightPalette.text)
    expect(lightTheme.colors.secondaryContainer).toBe(lightPalette.surfaceStrong)
    expect(lightTheme.colors.onSecondaryContainer).toBe(lightPalette.text)
    expect(lightTheme.colors.surface).toBe(lightPalette.surface)
    expect(lightTheme.colors.onSurface).toBe(lightPalette.text)
    expect(lightTheme.colors.background).toBe(lightPalette.surfaceSoft)
    expect(lightTheme.colors.onBackground).toBe(lightPalette.text)
    expect(lightTheme.colors.surfaceVariant).toBe(lightPalette.surfaceStrong)
    expect(lightTheme.colors.onSurfaceVariant).toBe(lightPalette.textMuted)
    expect(lightTheme.colors.error).toBe(lightPalette.error)
    expect(lightTheme.colors.onError).toBe(lightPalette.onPrimary)
  })

  it('darkTheme mapeia cada papel sobrescrito ao papel da paleta (botão primário branco, texto tinta)', () => {
    expect(darkTheme.colors.primary).toBe(darkPalette.primary)
    expect(darkTheme.colors.onPrimary).toBe(darkPalette.onPrimary)
    expect(darkTheme.colors.secondary).toBe(darkPalette.surfaceStrong)
    expect(darkTheme.colors.onSecondary).toBe(darkPalette.text)
    expect(darkTheme.colors.secondaryContainer).toBe(darkPalette.surfaceStrong)
    expect(darkTheme.colors.onSecondaryContainer).toBe(darkPalette.text)
    expect(darkTheme.colors.surface).toBe(darkPalette.canvas)
    expect(darkTheme.colors.onSurface).toBe(darkPalette.text)
    expect(darkTheme.colors.background).toBe(darkPalette.canvas)
    expect(darkTheme.colors.onBackground).toBe(darkPalette.text)
    expect(darkTheme.colors.surfaceVariant).toBe(darkPalette.surface)
    expect(darkTheme.colors.onSurfaceVariant).toBe(darkPalette.textBody)
    expect(darkTheme.colors.error).toBe(darkPalette.error)
    expect(darkTheme.colors.onError).toBe(darkPalette.onPrimary)
  })

  it('outline/outlineVariant permanecem no default MD3 (resíduo documentado)', () => {
    expect(lightTheme.colors.outline).toBe(MD3LightTheme.colors.outline)
    expect(lightTheme.colors.outlineVariant).toBe(MD3LightTheme.colors.outlineVariant)
    expect(darkTheme.colors.outline).toBe(MD3DarkTheme.colors.outline)
    expect(darkTheme.colors.outlineVariant).toBe(MD3DarkTheme.colors.outlineVariant)
  })

  it('elevation casa nível a nível com a paleta (1.11b — fim do violeta do <Banner>)', () => {
    expect(lightTheme.colors.elevation).toEqual({
      ...MD3LightTheme.colors.elevation,
      level1: lightPalette.surfaceSoft,
      level2: lightPalette.surfaceSoft,
      level3: lightPalette.surfaceStrong,
      level4: lightPalette.surfaceStrong,
      level5: lightPalette.surfaceStrong,
    })
    expect(darkTheme.colors.elevation).toEqual({
      ...MD3DarkTheme.colors.elevation,
      level1: darkMapping.element,
      level2: darkMapping.element,
      level3: darkMapping.hairline,
      level4: darkMapping.hairline,
      level5: darkMapping.hairline,
    })
  })

  it('fonts: variantes do DESIGN.md em Inter por peso; o resto do MD3 só troca a família (6.1)', () => {
    const mapped = {
      displaySmall: typography.displayCount,
      headlineMedium: typography.headline,
      titleLarge: typography.titleLg,
      titleMedium: typography.title,
      bodyLarge: typography.bodyLg,
      bodyMedium: typography.body,
      labelLarge: typography.label,
      bodySmall: typography.caption,
    }
    for (const [variant, token] of Object.entries(mapped)) {
      expect(lightTheme.fonts[variant as keyof typeof mapped]).toMatchObject(token)
    }
    for (const [variant, md3] of Object.entries(MD3LightTheme.fonts)) {
      if (variant in mapped) continue
      const actual = lightTheme.fonts[variant as keyof typeof lightTheme.fonts]
      const expectedFamily = md3.fontWeight === '500' ? fontFamily.medium : fontFamily.regular
      expect(actual).toEqual({ ...md3, fontFamily: expectedFamily })
    }
    expect(darkTheme.fonts).toBe(lightTheme.fonts)
    expect(darkTheme.custom).toBe(lightTheme.custom)
  })

  it('navigationTheme: fundo do React Navigation unificado no surface-soft, header canvas, Inter (6.1)', () => {
    expect(navigationTheme.dark).toBe(false)
    expect(navigationTheme.colors).toMatchObject({
      primary: lightPalette.primary,
      background: lightPalette.surfaceSoft,
      card: lightPalette.canvas,
      text: lightPalette.text,
      border: lightPalette.hairline,
    })
    expect(Object.values(navigationTheme.fonts).map((f) => f.fontFamily)).toEqual([
      fontFamily.regular,
      fontFamily.medium,
      fontFamily.semiBold,
      fontFamily.bold,
    ])
  })

  it('_layout: PaperProvider travado em lightTheme, sem flip por esquema do SO (trava da trava, 1.11b)', () => {
    const source = readSource('app/_layout.tsx')
    expect(source).not.toContain('useColorScheme')
    expect(source).not.toContain('darkTheme')
    expect(source.match(/<PaperProvider theme=\{lightTheme\}>/g)).toHaveLength(2)
  })

  it('_layout: navegador envolto no navigationTheme e Inter no gate de boot (6.1)', () => {
    const source = readSource('app/_layout.tsx')
    expect(source.match(/<ThemeProvider value=\{navigationTheme\}>/g)).toHaveLength(1)
    expect(source).toMatch(/useFonts\(\{[^}]*Inter_400Regular,[^}]*Inter_500Medium,[^}]*Inter_600SemiBold,[^}]*Inter_700Bold,/)
    expect(source).toMatch(/const isFontReady = isFontGateOpen\(fontsLoaded, fontError\)/)
    expect(source).toMatch(/const isBooting = [^\n]*!isFontReady/)
  })

  it('app.json: chrome nativo travado em light, splash e ícone no amarelo de marca (1.11b, D-UX-1)', () => {
    // A varredura de hex cobre só src/: o chrome nativo (headers, status bar,
    // splash, ícone adaptativo) é dirigido pelo app.json — sem este lock, a
    // metade nativa da trava light reverteria em silêncio (era o azul #208AEF
    // da paleta antiga).
    const appConfig = JSON.parse(
      readFileSync(join(SRC_ROOT, '..', 'app.json'), 'utf8'),
    ) as {
      expo: {
        name: string
        slug: string
        scheme: string
        userInterfaceStyle: string
        android: { package: string; adaptiveIcon: { backgroundColor: string } }
        plugins: [string, Record<string, unknown>][]
      }
    }
    expect(appConfig.expo.userInterfaceStyle).toBe('light')
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe(designTokens.signatureYellow)
    const splash = appConfig.expo.plugins.find(([name]) => name === 'expo-splash-screen')
    expect(splash?.[1].backgroundColor).toBe(designTokens.signatureYellow)
    // D-UX-11: only the display name changes. slug/scheme/package tie the EAS
    // project, the deep link and the installed APK.
    expect(appConfig.expo.name).toBe('PureUrban')
    expect(appConfig.expo.slug).toBe('mobile')
    expect(appConfig.expo.scheme).toBe('mobile')
    expect(appConfig.expo.android.package).toBe('com.pureurban.mobile')
    // Varredura negativa no config inteiro: os scalars acima não cobrem outras
    // chaves nativas (ícone, imagens, plugins futuros) onde o azul da paleta
    // antiga poderia voltar em silêncio.
    const serialized = JSON.stringify(appConfig).toLowerCase()
    expect(serialized).not.toContain('#208aef')
    expect(serialized).not.toContain('#e6f4fe')
  })
})

describe('lock de binding — STATUS_PRESENTATION e faixas do OfflineBanner', () => {
  it('STATUS_PRESENTATION vale exatamente os papéis da paleta', () => {
    expect(STATUS_PRESENTATION.CHECKED_IN.color).toBe(lightPalette.success)
    expect(STATUS_PRESENTATION.CHECKED_IN.background).toBe(statusTints.success)
    expect(STATUS_PRESENTATION.NOT_CHECKED_IN.color).toBe(lightPalette.textBody)
    expect(STATUS_PRESENTATION.NOT_CHECKED_IN.background).toBe(statusTints.neutral)
    expect(STATUS_PRESENTATION.NOT_RETURNING.color).toBe(lightPalette.warning)
    expect(STATUS_PRESENTATION.NOT_RETURNING.background).toBe(statusTints.warning)
  })

  it.each([
    ['CHECKED_IN', 'Embarcou'],
    ['NOT_CHECKED_IN', 'Não embarcou'],
    ['NOT_RETURNING', 'Não vai voltar'],
  ] as [BoardingStatus, string][])('render-probe do StudentCard: chip de %s', (status) => {
    // Um probe por teste: o cleanup automático entre testes desmonta a árvore —
    // cleanup manual + render no mesmo tick quebra o renderer do RNTL.
    const colors = chipColorsFor(status)
    expect(colors).toEqual({
      color: STATUS_PRESENTATION[status].color,
      background: STATUS_PRESENTATION[status].background,
    })
  })

  it('render-probe do OfflineBanner: faixa pendente na família ink/body', () => {
    const backgrounds = allBackgroundsOf(
      createElement(OfflineBanner, { pendingCount: 1, failedCount: 0 }),
    )
    expect(backgrounds).toContain(lightPalette.textBody)
  })

  it('render-probe do OfflineBanner: faixa de falha no vermelho único', () => {
    const backgrounds = allBackgroundsOf(
      createElement(OfflineBanner, { pendingCount: 0, failedCount: 1 }),
    )
    expect(backgrounds).toContain(lightPalette.error)
  })

  it('render-probe do OfflineBanner: texto e rótulo do Dispensar em onPrimary/erro', () => {
    render(
      createElement(OfflineBanner, {
        pendingCount: 1,
        failedCount: 1,
        onDismissFailed: () => {},
      }),
    )
    expect(StyleSheet.flatten(screen.getByText(/Modo Offline/).props.style)?.color).toBe(
      lightPalette.onPrimary,
    )
    expect(StyleSheet.flatten(screen.getByText(/não pôde ser enviado/).props.style)?.color).toBe(
      lightPalette.onPrimary,
    )
    expect(StyleSheet.flatten(screen.getByText('Dispensar').props.style)?.color).toBe(lightPalette.error)
  })
})

describe('locks de call-site (source-lock)', () => {
  it('trip: encerrar no vermelho único e chips nos tons de status', () => {
    expect(readSource('components/trip/active-trip-actions.tsx')).toMatch(/color=\{lightPalette\.error\}/)
    const card = readSource('components/trip/trip-card.tsx')
    expect(card).toMatch(/icon="progress-clock" tone="success"/)
    expect(card).toMatch(/icon="flag-checkered" tone="info"/)
  })

  it('scan: TONE_COLOR e overlay Verificando presos aos papéis da paleta (render-probe exigiria o stack da câmera)', () => {
    const source = readSource('app/(driver)/scan.tsx')
    expect(source).toMatch(/success: lightPalette\.success,/)
    expect(source).toMatch(/warn: lightPalette\.warning,/)
    expect(source).toMatch(/error: lightPalette\.error,/)
    expect(source).toMatch(/offline: lightPalette\.textBody,/)
    expect(source).toMatch(/backgroundColor: lightPalette\.primary \}/)
  })

  it('routes: papéis de texto e superfícies presos à paleta', () => {
    const source = readSource('app/(driver)/routes.tsx')
    expect(source).toMatch(/wrapper: \{[^}]*backgroundColor: lightPalette\.surfaceSoft,/)
    expect(source).toMatch(/routeLabel: \{[^}]*color: lightPalette\.textMuted,/)
    expect(source).toMatch(/routeValue: \{[^}]*color: lightPalette\.textBody,/)
  })

  it('app-header: fundo, divisória e tinta presos à paleta', () => {
    const source = readSource('lib/app-header.tsx')
    expect(source).toMatch(/headerTintColor: lightPalette\.text,/)
    expect(source).toMatch(/background: \{[^}]*backgroundColor: lightPalette\.canvas,/)
    expect(source).toMatch(/background: \{[^}]*borderBottomColor: lightPalette\.hairline,/)
  })

  it('student-list: papéis de texto, header e divisória presos à paleta', () => {
    const source = readSource('app/(driver)/student-list.tsx')
    expect(source).toMatch(/container: \{[^}]*backgroundColor: lightPalette\.surfaceSoft,/)
    expect(source).toMatch(/header: \{[^}]*backgroundColor: lightPalette\.surface,/)
    expect(source).toMatch(/header: \{[^}]*borderBottomColor: lightPalette\.hairline,/)
    expect(source).toMatch(/count: \{[^}]*color: lightPalette\.text,/)
  })

  it('student-card: nome e divisória presos à paleta (chip é coberto pelo render-probe)', () => {
    const source = readSource('components/student-card.tsx')
    expect(source).toMatch(/name: \{[^}]*color: lightPalette\.text,/)
    expect(source).toMatch(/borderBottomColor: lightPalette\.hairline,/)
  })
})
