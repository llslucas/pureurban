import type { MdiIconName } from '@/components/ui/mdi-icon'
import type { SemanticColors, StatusTints } from '@/lib/palette'
import type { BoardingStatus } from '@/services/trip.service'

export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export interface ToneColors {
  color: string
  background: string
}

// Colors depend on the scheme, so they're resolved against the theme's palette
// and tints at render time; text and icon stay static below.
export function toneColors(tone: ChipTone, palette: SemanticColors, tints: StatusTints): ToneColors {
  return { color: tone === 'neutral' ? palette.textBody : palette[tone], background: tints[tone] }
}

export interface StatusPresentation {
  label: string
  tone: ChipTone
  mdiIcon: MdiIconName
  accessibilityLabel: string
}

// Module constant, not an inline `switch` in JSX. `Record` over the union: a new
// `status` in the contract breaks the typecheck here, not the screen.
export const STATUS_PRESENTATION: Record<BoardingStatus, StatusPresentation> = {
  CHECKED_IN: {
    label: 'Embarcou',
    tone: 'success',
    mdiIcon: 'check-circle',
    accessibilityLabel: 'Status: embarcou',
  },
  NOT_CHECKED_IN: {
    label: 'Não embarcou',
    tone: 'neutral',
    mdiIcon: 'clock-outline',
    accessibilityLabel: 'Status: não embarcou',
  },
  NOT_RETURNING: {
    label: 'Não vai voltar',
    tone: 'warning',
    mdiIcon: 'account-cancel',
    accessibilityLabel: 'Status: não vai voltar',
  },
}

// A status from an older contract rehydrated from the cache, or a future one,
// falls back to "Não embarcou" instead of crashing the row.
export function presentationOf(status: BoardingStatus): StatusPresentation {
  return STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.NOT_CHECKED_IN
}

export function statusColors(status: BoardingStatus, palette: SemanticColors, tints: StatusTints): ToneColors {
  return toneColors(presentationOf(status).tone, palette, tints)
}
