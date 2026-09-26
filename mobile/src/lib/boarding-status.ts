import type { MdiIconName } from '@/components/ui/mdi-icon'
import { lightPalette, statusTints } from '@/lib/palette'
import type { BoardingStatus } from '@/services/trip.service'

export interface StatusPresentation {
  label: string
  color: string
  background: string
  mdiIcon: MdiIconName
  accessibilityLabel: string
}

// Constante de módulo, não `switch` inline no JSX (Task 2.3). `Record` sobre o
// union: um `status` novo no contrato quebra o typecheck aqui, não a tela.
// Cores = papéis da paleta única (`@/lib/palette`) — nova cor entra lá primeiro.
export const STATUS_PRESENTATION: Record<BoardingStatus, StatusPresentation> = {
  CHECKED_IN: {
    label: 'Embarcou',
    color: lightPalette.success,
    background: statusTints.success,
    mdiIcon: 'check-circle',
    accessibilityLabel: 'Status: embarcou',
  },
  NOT_CHECKED_IN: {
    label: 'Não embarcou',
    color: lightPalette.textBody,
    background: statusTints.neutral,
    mdiIcon: 'clock-outline',
    accessibilityLabel: 'Status: não embarcou',
  },
  NOT_RETURNING: {
    label: 'Não vai voltar',
    color: lightPalette.warning,
    background: statusTints.warning,
    mdiIcon: 'account-cancel',
    accessibilityLabel: 'Status: não vai voltar',
  },
}
