import { screen } from '@testing-library/react-native'
import React, { type ComponentType } from 'react'
import { ActivityIndicator } from 'react-native-paper'

import {
  BusEtaCardSkeleton,
  RouteSelectorSkeleton,
  ScanSkeleton,
  type ScreenSkeletonProps,
  StudentListSkeleton,
  TripCardSkeleton,
} from '@/components/ui/screen-skeletons'
import { renderUi } from '@/components/ui/test-utils'

const hidden = { includeHiddenElements: true }

describe.each([
  ['TripCardSkeleton', TripCardSkeleton, 'trip-skeleton'],
  ['RouteSelectorSkeleton', RouteSelectorSkeleton, 'route-selector-skeleton'],
  ['StudentListSkeleton', StudentListSkeleton, 'student-list-skeleton'],
  ['BusEtaCardSkeleton', BusEtaCardSkeleton, 'bus-eta-card-skeleton'],
  ['ScanSkeleton', ScanSkeleton, 'scan-skeleton'],
] as [string, ComponentType<ScreenSkeletonProps>, string][])('%s', (_name, Component, defaultTestID) => {
  it('is one labelled loading group made of hidden blocks, with no spinner', async () => {
    await renderUi(<Component label="Carregando..." />)
    const group = screen.getByLabelText('Carregando...')
    expect(group.props.testID).toBe(defaultTestID)
    expect(group.props.accessibilityRole).toBe('progressbar')
    expect(screen.getAllByTestId('skeleton', hidden).length).toBeGreaterThan(1)
    expect(screen.queryByTestId('skeleton')).toBeNull()
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
  })

  it('takes a custom testID', async () => {
    await renderUi(<Component label="Carregando..." testID="custom" />)
    expect(screen.getByTestId('custom')).toBeTruthy()
  })
})

it('StudentListSkeleton draws six student rows', async () => {
  await renderUi(<StudentListSkeleton label="Carregando alunos..." />)
  expect(screen.getAllByTestId('student-list-skeleton-row', hidden)).toHaveLength(6)
})
