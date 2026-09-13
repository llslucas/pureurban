import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  STATUS_TINT_ALPHA,
  appExtensions,
  darkPalette,
  designTokens,
  lightPalette,
} from '@/lib/palette'

// Duas travas da story 1.11, no padrão das trancas-regressão do repo
// (precedente `query-never-pauses.test.ts`):
//
// (a) GUARDA DE HEX: nenhuma cor `#RRGGBB`/`#RGB` fora de `lib/palette.ts`,
//     salvo as allowlists funcionais documentadas abaixo. Nova cor = token
//     novo na paleta com decisão registrada na story — nunca um hex local.
// (b) CONTRASTE: os pares texto×fundo dos dois temas passam WCAG AA (4.5:1;
//     3:1 onde só texto grande/rótulo de badge se aplica), calculados aqui —
//     sem depender de olho humano.

const SRC_ROOT = join(__dirname, '..')

// Allowlist de hexes FUNCIONAIS (não semânticos): cores dadas por hardware ou
// protocolo de leitura, que não podem seguir tema. Qualquer outra exceção
// precisa de decisão registrada na story antes de entrar aqui.
const ALLOWLIST: Record<string, { reason: string; hexes: string[] }> = {
  // Quiet zone do QR: leitores exigem branco puro/preto puro, independente de
  // tema — mudar isso quebra a leitura na câmera do motorista.
  'components/student-qr-code.tsx': {
    reason: 'quiet zone do QR (leitura exige branco puro/preto puro)',
    hexes: ['#FFFFFF', '#000000'],
  },
  // Chrome de câmera: backdrop/máscara sobre o feed com cantos de contraste
  // máximo (NFR18) — não é cor de marca nem de status.
  'components/qr-scanner.tsx': {
    reason: 'chrome da câmera (backdrop, máscara e cantos sobre o feed)',
    hexes: ['#000000', '#FFFFFF'],
  },
  // Backdrop do scanner quando a câmera está fora de foco/desmontada.
  'app/(driver)/scan.tsx': {
    reason: 'fundo preto do chrome da câmera',
    hexes: ['#000000'],
  },
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

// 6 dígitos (ou o atalho de 3), não seguidos de outro hex: `#9619` num comentário
// (número de issue) NÃO é cor e não pode derrubar a guarda.
const HEX_PATTERN = /#[0-9a-fA-F]{6}(?![0-9a-fA-F])|#[0-9a-fA-F]{3}(?![0-9a-fA-F])/g

describe('guarda de paleta — nenhum hex fora do módulo', () => {
  it('todo hex em mobile/src vive em lib/palette.ts ou numa allowlist', () => {
    const offenders: string[] = []

    for (const fullPath of listSourceFiles(SRC_ROOT)) {
      const relativePath = fullPath.slice(SRC_ROOT.length + 1).split('\\').join('/')
      // O próprio módulo-fonte e este teste (que documenta as allowlists).
      if (relativePath === 'lib/palette.ts') continue
      if (relativePath === 'lib/palette.guard.test.ts') continue

      const allowed = new Set(
        (ALLOWLIST[relativePath]?.hexes ?? []).map((hex) => hex.toUpperCase()),
      )

      const lines = readFileSync(fullPath, 'utf8').split('\n')
      lines.forEach((line, lineIndex) => {
        for (const match of line.matchAll(HEX_PATTERN)) {
          if (!allowed.has(match[0].toUpperCase())) {
            offenders.push(`${relativePath}:${lineIndex + 1} ${match[0]}`)
          }
        }
      })
    }

    // A lista aponta arquivo:linha de cada hex reprovado.
    expect(offenders).toEqual([])
  })

  it('allowlist sem entradas mortas: todo hex listado ainda existe no arquivo', () => {
    for (const [relativePath, { hexes }] of Object.entries(ALLOWLIST)) {
      const content = readFileSync(join(SRC_ROOT, relativePath), 'utf8')
      for (const hex of hexes) {
        expect(
          content.includes(hex) || content.includes(hex.toLowerCase()),
        ).toBe(true)
      }
    }
  })
})

// ---- Contraste WCAG AA dos pares dos dois temas ----

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

// Fórmula de luminância relativa WCAG 2.x.
function luminance([r, g, b]: Rgb): number {
  const linearize = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const l1 = luminance(foreground)
  const l2 = luminance(background)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

// Composita o tinte alpha sobre a superfície: é a cor EFETIVA que o chip
// mostra, sobre a qual o texto do status precisa contrastar.
function compositeOver(tintHex: string, base: Rgb): Rgb {
  const tint = hexToRgb(tintHex)
  return [0, 1, 2].map((i) =>
    Math.round(STATUS_TINT_ALPHA * tint[i] + (1 - STATUS_TINT_ALPHA) * base[i]),
  ) as Rgb
}

// Título do teste = o par; o mínimo (4.5 = AA texto normal; 3 = AA
// texto grande ≥ 18px / rótulo de badge, piso de componente de UI) vem na tabela.
type Pair = [role: string, fg: Rgb, bg: Rgb, min: number]

describe('contraste AA — tema claro', () => {
  const surface = hexToRgb(designTokens.canvas)

  test.each<Pair>([
    ['text/background', hexToRgb(lightPalette.text), hexToRgb(lightPalette.background), 4.5],
    ['textBody/background', hexToRgb(lightPalette.textBody), hexToRgb(lightPalette.background), 4.5],
    ['textMuted/background', hexToRgb(lightPalette.textMuted), hexToRgb(lightPalette.background), 4.5],
    ['text/surface', hexToRgb(lightPalette.text), surface, 4.5],
    ['onPrimary/primary', hexToRgb(lightPalette.onPrimary), hexToRgb(lightPalette.primary), 4.5],
    // Status como texto sobre superfície (chips, textos de erro).
    ['success/surface', hexToRgb(lightPalette.success), surface, 4.5],
    ['error/surface', hexToRgb(lightPalette.error), surface, 4.5],
    ['info/surface', hexToRgb(lightPalette.info), surface, 4.5],
    ['link/surface', hexToRgb(lightPalette.link), surface, 4.5],
    // D3: âmbar é extensão app-only (4.2:1 no branco, escolha da review 3.5b);
    // entra como rótulo de badge/overlay — o piso aplicável é 3:1.
    ['warning/surface', hexToRgb(lightPalette.warning), surface, 3],
    // Status como TEXTO sobre o próprio tinte (chips da student card / trip).
    ['success/successTint', hexToRgb(lightPalette.success), compositeOver(designTokens.success, surface), 4.5],
    ['info/infoTint', hexToRgb(lightPalette.info), compositeOver(designTokens.info, surface), 4.5],
    ['textBody/neutralTint', hexToRgb(lightPalette.textBody), compositeOver(designTokens.body, surface), 4.5],
    ['warning/warningTint', hexToRgb(lightPalette.warning), compositeOver(appExtensions.warning, surface), 3],
    // Texto branco sobre superfícies de status (overlays do scan, faixas do
    // OfflineBanner). Títulos são grandes; âmbar fica no piso de 3:1 (D3).
    ['onPrimary/success', hexToRgb(lightPalette.onPrimary), hexToRgb(lightPalette.success), 4.5],
    ['onPrimary/error', hexToRgb(lightPalette.onPrimary), hexToRgb(lightPalette.error), 4.5],
    ['onPrimary/textBody (faixa offline)', hexToRgb(lightPalette.onPrimary), hexToRgb(lightPalette.textBody), 4.5],
    ['onPrimary/warning', hexToRgb(lightPalette.onPrimary), hexToRgb(lightPalette.warning), 3],
  ])('%s', (_role, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min)
  })
})

describe('contraste AA — tema escuro (mapeamento D6)', () => {
  const background = hexToRgb(darkPalette.background)
  const surface = hexToRgb(darkPalette.surface)

  test.each<Pair>([
    ['text/background', hexToRgb(darkPalette.text), background, 4.5],
    ['textBody/background', hexToRgb(darkPalette.textBody), background, 4.5],
    ['textMuted/background', hexToRgb(darkPalette.textMuted), background, 4.5],
    ['text/surface', hexToRgb(darkPalette.text), surface, 4.5],
    // D6: botão primário em dark é BRANCO com texto tinta.
    ['onPrimary/primary (tinta sobre botão branco)', hexToRgb(darkPalette.onPrimary), hexToRgb(darkPalette.primary), 4.5],
    // Em dark, status como TEXTO usa as variantes -border documentadas
    // (successBorder/infoBorder); as bases escuras não contrastam sobre tinta.
    ['successBorder/background', hexToRgb(designTokens.successBorder), background, 4.5],
    ['infoBorder/background', hexToRgb(designTokens.infoBorder), background, 4.5],
    ['warning/warningTint', hexToRgb(darkPalette.warning), compositeOver(appExtensions.warning, surface), 3],
    ['textBody/neutralTint', hexToRgb(darkPalette.textBody), compositeOver(designTokens.body, surface), 4.5],
    // Erro como superfície: o texto por cima é sempre branco (faixas e
    // overlays de erro são invariantes de tema; `onError` do tema usa o mesmo
    // branco).
    ['onPrimary(white)/error', hexToRgb(designTokens.onPrimary), hexToRgb(darkPalette.error), 4.5],
  ])('%s', (_role, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min)
  })
})
