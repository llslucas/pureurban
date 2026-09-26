import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { STATUS_PRESENTATION } from '@/lib/boarding-status'
import { CHIP_TONES, StatusChip, type ChipTone } from '@/components/ui/status-chip'
import { contrastRatio, renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import type { BoardingStatus } from '@/services/trip.service'

const hidden = { includeHiddenElements: true }

function chipIcon(): string | undefined {
  return screen
    .getByTestId('status-chip', hidden)
    .findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
}

function chipStyle() {
  return StyleSheet.flatten(screen.getByTestId('status-chip').props.style)
}

describe('StatusChip', () => {
  it.each([
    ['CHECKED_IN', 'Embarcou', 'check-circle', lightPalette.success],
    ['NOT_CHECKED_IN', 'Não embarcou', 'clock-outline', lightPalette.textBody],
    ['NOT_RETURNING', 'Não vai voltar', 'account-cancel', lightPalette.warning],
  ] as [BoardingStatus, string, string, string][])(
    '%s → "%s" with %s (D-UX-12)',
    async (status, label, icon, color) => {
      await renderUi(<StatusChip status={status} />)
      expect(screen.getByText(label)).toBeTruthy()
      expect(chipIcon()).toBe(icon)
      expect(StyleSheet.flatten(screen.getByText(label).props.style).color).toBe(color)
      expect(chipStyle().backgroundColor).toBe(STATUS_PRESENTATION[status].background)
      expect(screen.getByLabelText(STATUS_PRESENTATION[status].accessibilityLabel)).toBeTruthy()
    },
  )

  it('an unknown status (old cache) falls back to NOT_CHECKED_IN', async () => {
    await renderUi(<StatusChip status={'SOMETHING_NEW' as BoardingStatus} />)
    expect(screen.getByText('Não embarcou')).toBeTruthy()
    expect(chipIcon()).toBe('clock-outline')
  })

  it('is a 32dp pill', async () => {
    await renderUi(<StatusChip status="CHECKED_IN" />)
    expect(chipStyle().minHeight).toBe(32)
    expect(chipStyle().borderRadius).toBe(9999)
  })

  it.each(Object.keys(CHIP_TONES) as ChipTone[])('generic chip in the %s tone', async (tone) => {
    await renderUi(<StatusChip label="Em andamento" icon="progress-clock" tone={tone} />)
    expect(chipIcon()).toBe('progress-clock')
    expect(StyleSheet.flatten(screen.getByText('Em andamento').props.style).color).toBe(CHIP_TONES[tone].color)
    expect(chipStyle().backgroundColor).toBe(CHIP_TONES[tone].background)
    expect(screen.getByLabelText('Em andamento')).toBeTruthy()
  })

  it('the icon stays out of the accessibility tree', async () => {
    await renderUi(<StatusChip status="CHECKED_IN" />)
    const hiddenGlyphs = screen
      .getByTestId('status-chip', hidden)
      .findAll((node: TestNode) => node.props.name === 'check-circle' && node.props.importantForAccessibility === 'no-hide-descendants')
    expect(hiddenGlyphs.length).toBeGreaterThan(0)
  })

  describe('contrast of text × tint (composited over the canvas)', () => {
    it.each(Object.keys(STATUS_PRESENTATION) as BoardingStatus[])('%s', (status) => {
      const { color, background } = STATUS_PRESENTATION[status]
      // D3 (story 1.11): amber sits on the 3:1 floor, accepted because the chip
      // always pairs it with an icon and a bold label.
      const min = status === 'NOT_RETURNING' ? 3 : 4.5
      expect(contrastRatio(color, background, lightPalette.canvas)).toBeGreaterThanOrEqual(min)
    })

    it.each(Object.keys(CHIP_TONES) as ChipTone[])('tone %s', (tone) => {
      const { color, background } = CHIP_TONES[tone]
      const min = tone === 'warning' ? 3 : 4.5
      expect(contrastRatio(color, background, lightPalette.canvas)).toBeGreaterThanOrEqual(min)
    })
  })
})
