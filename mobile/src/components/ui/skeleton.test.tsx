import { fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { useReducedMotion } from 'react-native-reanimated'

import { Skeleton } from '@/components/ui/skeleton'
import { renderUi } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { radius } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

afterEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false)
  jest.restoreAllMocks()
})

function layout(width: number) {
  fireEvent(screen.getByTestId('skeleton', hidden), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 16 } },
  })
}

describe('Skeleton', () => {
  it('is a surface-strong block with the requested size and radius.sm', async () => {
    await renderUi(<Skeleton width={120} height={16} />)
    const style = StyleSheet.flatten(screen.getByTestId('skeleton', hidden).props.style)
    expect(style).toMatchObject({
      width: 120,
      height: 16,
      borderRadius: radius.sm,
      backgroundColor: lightPalette.surfaceStrong,
    })
  })

  it('is hidden from assistive tech', async () => {
    await renderUi(<Skeleton height={16} />)
    expect(screen.queryByTestId('skeleton')).toBeNull()
    expect(screen.getByTestId('skeleton', hidden).props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('shimmers across the measured width', async () => {
    const withRepeat = jest.spyOn(Reanimated, 'withRepeat')
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderUi(<Skeleton height={16} />)
    expect(withRepeat).not.toHaveBeenCalled()
    layout(200)
    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 1200 }))
    expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1)
    const shimmer = StyleSheet.flatten(screen.getByTestId('skeleton-shimmer', hidden).props.style)
    expect(shimmer.width).toBe(200)
    // Starts fully off to the left of the block.
    expect(shimmer.transform).toEqual([{ translateX: -200 }])
  })

  it('reduced motion: no shimmer', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const withRepeat = jest.spyOn(Reanimated, 'withRepeat')
    const withTiming = jest.spyOn(Reanimated, 'withTiming')
    await renderUi(<Skeleton height={16} />)
    layout(200)
    expect(screen.queryByTestId('skeleton-shimmer', hidden)).toBeNull()
    expect(withRepeat).not.toHaveBeenCalled()
    expect(withTiming).not.toHaveBeenCalled()
  })
})
