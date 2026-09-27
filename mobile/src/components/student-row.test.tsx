import { act, render, screen } from '@testing-library/react-native'
import React, { type ReactElement, type ReactNode } from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { useReducedMotion } from 'react-native-reanimated'

import { initialsOf, StudentRow } from '@/components/student-row'
import { type TestNode } from '@/components/ui/test-utils'
import { STATUS_PRESENTATION, statusColors } from '@/lib/boarding-status'
import { darkPalette, darkStatusTints, lightPalette, lightStatusTints } from '@/lib/palette'
import { darkTheme, lightTheme } from '@/lib/theme'
import { motion, radius } from '@/lib/tokens'
import type { BoardingStatus, TripStudentItem } from '@/services/trip.service'

// The row is the only surface that turns the contract `status` into something
// the driver reads at a glance.

const hidden = { includeHiddenElements: true }

function Providers({ children }: { children: ReactNode }) {
  return <PaperProvider theme={lightTheme}>{children}</PaperProvider>
}

// A `wrapper` (not renderUi) so `rerender` updates the same row instead of
// remounting it — the pulse only fires on a change seen by a mounted row.
async function renderRow(element: ReactElement) {
  const utils = render(element, { wrapper: Providers })
  await act(async () => {})
  return utils
}

function makeStudent(overrides: Partial<TripStudentItem> = {}): TripStudentItem {
  return {
    studentId: '660e8400-e29b-41d4-a716-446655440010',
    name: 'Ana Souza',
    status: 'NOT_CHECKED_IN',
    checkedInAt: null,
    ...overrides,
  }
}

function chipIcon(): string | undefined {
  return screen
    .getByTestId('student-row-chip', hidden)
    .findAll((node: TestNode) => typeof node.props.name === 'string')[0]?.props.name
}

function pulseBackground() {
  return StyleSheet.flatten(screen.getByTestId('student-row-pulse', hidden).props.style).backgroundColor
}

afterEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

describe('initialsOf', () => {
  it.each([
    ['Ana Souza', 'AS'],
    ['Ana', 'A'],
    ['  ', '?'],
    ['', '?'],
    ['ana maria de souza', 'AS'],
    ['  Ísis  ', 'Í'],
    ['E\u0301rica Souza', 'ÉS'],
  ])('"%s" → "%s"', (name, initials) => {
    expect(initialsOf(name)).toBe(initials)
  })
})

describe('StudentRow', () => {
  it.each([
    ['CHECKED_IN', 'Embarcou', 'check-circle'],
    ['NOT_CHECKED_IN', 'Não embarcou', 'clock-outline'],
    ['NOT_RETURNING', 'Não vai voltar', 'account-cancel'],
  ] as [BoardingStatus, string, string][])('%s → chip "%s" with the %s icon, no glyph', async (status, label, icon) => {
    await renderRow(<StudentRow student={makeStudent({ status })} />)
    expect(screen.getByText(label)).toBeTruthy()
    expect(chipIcon()).toBe(icon)
    expect(screen.queryByText(/[✓—!]/)).toBeNull()
  })

  it('distinguishes statuses by text, not only by color (NFR18)', () => {
    const labels = new Set(Object.values(STATUS_PRESENTATION).map((p) => p.label))
    expect(labels.size).toBe(Object.keys(STATUS_PRESENTATION).length)
    for (const p of Object.values(STATUS_PRESENTATION)) {
      expect(p.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('shows a 40dp initials avatar on the strong surface', async () => {
    await renderRow(<StudentRow student={makeStudent({ name: 'Bruno Lima' })} />)
    expect(screen.getByText('BL')).toBeTruthy()
    const avatar = StyleSheet.flatten(screen.getByTestId('student-row-avatar').props.style)
    expect(avatar).toMatchObject({
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: lightPalette.surfaceStrong,
    })
  })

  it('is at least 64dp tall and the name wraps to at most 2 lines', async () => {
    await renderRow(<StudentRow student={makeStudent()} />)
    expect(StyleSheet.flatten(screen.getByTestId('student-row').props.style).minHeight).toBe(64)
    expect(screen.getByText('Ana Souza').props.numberOfLines).toBe(2)
  })

  it('CHECKED_IN with checkedInAt shows the local time', async () => {
    const iso = '2026-07-12T21:10:00.000Z'
    const expected = new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    await renderRow(<StudentRow student={makeStudent({ status: 'CHECKED_IN', checkedInAt: iso })} />)
    expect(screen.getByText(expected)).toBeTruthy()
    expect(screen.getByLabelText(`Ana Souza, Embarcou às ${expected}`)).toBeTruthy()
  })

  it('NOT_CHECKED_IN and NOT_RETURNING render no time line', async () => {
    const timeRe = /^\d{1,2}:\d{2}/
    const { rerender } = await renderRow(<StudentRow student={makeStudent({ status: 'NOT_CHECKED_IN' })} />)
    expect(screen.queryByText(timeRe)).toBeNull()

    rerender(<StudentRow student={makeStudent({ status: 'NOT_RETURNING' })} />)
    expect(screen.queryByText(timeRe)).toBeNull()
  })

  it('an unknown status (old contract in the cache) does not take the row down', async () => {
    const rogue = makeStudent({ status: 'SOMETHING_NEW' as unknown as TripStudentItem['status'] })
    await renderRow(<StudentRow student={rogue} />)
    expect(screen.getByText('Não embarcou')).toBeTruthy()
  })

  it('an unparseable checkedInAt shows neither "Invalid Date" nor a time in the label', async () => {
    await renderRow(<StudentRow student={makeStudent({ status: 'CHECKED_IN', checkedInAt: 'not-a-date' })} />)
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
    expect(screen.getByLabelText('Ana Souza, Embarcou')).toBeTruthy()
  })

  it('exposes a single accessibility label combining name and status', async () => {
    await renderRow(<StudentRow student={makeStudent({ name: 'Bruno Lima', status: 'NOT_CHECKED_IN' })} />)
    expect(screen.getByLabelText('Bruno Lima, Não embarcou')).toBeTruthy()
  })

  it('STATUS_PRESENTATION covers the whole status union of the contract', () => {
    // `Record<BoardingStatus, true>`: a new status in the contract breaks this
    // test's typecheck (missing key), not the screen.
    const expectedStatuses: Record<BoardingStatus, true> = {
      CHECKED_IN: true,
      NOT_CHECKED_IN: true,
      NOT_RETURNING: true,
    }
    expect(Object.keys(STATUS_PRESENTATION).sort()).toEqual(Object.keys(expectedStatuses).sort())
  })

  describe('pulse on status change', () => {
    it('the first render does not pulse', async () => {
      const withTiming = jest.spyOn(Reanimated, 'withTiming')
      const withSequence = jest.spyOn(Reanimated, 'withSequence')
      await renderRow(<StudentRow student={makeStudent()} />)
      expect(withTiming).not.toHaveBeenCalledWith(0, { duration: motion.pulse })
      expect(withTiming).not.toHaveBeenCalledWith(1, { duration: motion.standard })
      expect(withSequence).not.toHaveBeenCalled()
    })

    it('a status change pulses the new status tint over motion.pulse and fades the chip over motion.standard', async () => {
      const withTiming = jest.spyOn(Reanimated, 'withTiming')
      const { rerender } = await renderRow(<StudentRow student={makeStudent()} />)

      const withSequence = jest.spyOn(Reanimated, 'withSequence')
      rerender(<StudentRow student={makeStudent({ status: 'NOT_RETURNING' })} />)

      expect(withTiming).toHaveBeenCalledWith(0, { duration: motion.pulse })
      expect(withTiming).toHaveBeenCalledWith(1, { duration: motion.standard })
      // The mock's withTiming returns its target: the pulse snaps to 1 then fades
      // to 0; the chip snaps to 0 then fades back to 1.
      expect(withSequence).toHaveBeenCalledTimes(2)
      expect(withSequence).toHaveBeenCalledWith(1, 0)
      expect(withSequence).toHaveBeenCalledWith(0, 1)
      expect(pulseBackground()).toBe(statusColors('NOT_RETURNING', lightPalette, lightStatusTints).background)
      expect(screen.getByText('Não vai voltar')).toBeTruthy()
    })

    it('reverting to NOT_CHECKED_IN pulses in the neutral tint', async () => {
      const withTiming = jest.spyOn(Reanimated, 'withTiming')
      const { rerender } = await renderRow(<StudentRow student={makeStudent({ status: 'NOT_RETURNING' })} />)

      rerender(<StudentRow student={makeStudent({ status: 'NOT_CHECKED_IN' })} />)

      expect(withTiming).toHaveBeenCalledWith(0, { duration: motion.pulse })
      expect(pulseBackground()).toBe(statusColors('NOT_CHECKED_IN', lightPalette, lightStatusTints).background)
    })

    it('a re-render with the same status does not pulse', async () => {
      const withTiming = jest.spyOn(Reanimated, 'withTiming')
      const { rerender } = await renderRow(<StudentRow student={makeStudent()} />)

      rerender(<StudentRow student={makeStudent({ name: 'Ana Souza' })} />)

      expect(withTiming).not.toHaveBeenCalledWith(0, { duration: motion.pulse })
    })

    it('reduced motion: no background pulse, the chip fades over motion.reduced', async () => {
      jest.mocked(useReducedMotion).mockReturnValue(true)
      const withTiming = jest.spyOn(Reanimated, 'withTiming')
      const { rerender } = await renderRow(<StudentRow student={makeStudent()} />)

      const withSequence = jest.spyOn(Reanimated, 'withSequence')
      rerender(<StudentRow student={makeStudent({ status: 'CHECKED_IN' })} />)

      expect(withTiming).not.toHaveBeenCalledWith(0, { duration: motion.pulse })
      expect(withTiming).toHaveBeenCalledWith(1, { duration: motion.reduced })
      expect(withSequence).toHaveBeenCalledTimes(1)
      expect(withSequence).toHaveBeenCalledWith(0, 1)
    })

    it('the pulse layer rests invisible behind the content', async () => {
      await renderRow(<StudentRow student={makeStudent()} />)
      const layer = screen.getByTestId('student-row-pulse', hidden)
      expect(StyleSheet.flatten(layer.props.style)).toMatchObject({ position: 'absolute', opacity: 0 })
      expect(layer.props.pointerEvents).toBe('none')
    })
  })
})

describe('StudentRow under darkTheme', () => {
  it.each([
    ['CHECKED_IN', 'Embarcou'],
    ['NOT_CHECKED_IN', 'Não embarcou'],
    ['NOT_RETURNING', 'Não vai voltar'],
  ] as [BoardingStatus, string][])('%s: dark row and on-dark chip', async (status, label) => {
    render(
      <PaperProvider theme={darkTheme}>
        <StudentRow student={makeStudent({ status })} />
      </PaperProvider>,
    )
    await act(async () => {})
    const expected = statusColors(status, darkPalette, darkStatusTints)
    expect(StyleSheet.flatten(screen.getByText(label).props.style).color).toBe(expected.color)
    expect(StyleSheet.flatten(screen.getByTestId('student-row-chip').props.style).backgroundColor).toBe(
      expected.background,
    )
    expect(StyleSheet.flatten(screen.getByTestId('student-row').props.style).backgroundColor).toBe(darkPalette.surface)
    expect(StyleSheet.flatten(screen.getByText('AS').props.style).color).toBe(darkPalette.text)
  })
})
