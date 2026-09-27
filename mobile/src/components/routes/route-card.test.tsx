import { screen } from '@testing-library/react-native'
import React from 'react'
import { StyleSheet } from 'react-native'

import { RouteCard, routeAccessibilityLabel, type RouteCardProps } from '@/components/routes/route-card'
import { renderUi, type TestNode } from '@/components/ui/test-utils'
import { lightPalette } from '@/lib/palette'
import { radius, typography } from '@/lib/tokens'

const hidden = { includeHiddenElements: true }

const ROUTE: RouteCardProps['route'] = {
  name: 'Linha Centro - Universidade',
  originCity: 'Centro',
  destinationCity: 'Campus Universitário',
  description: 'Rota matutina entre o centro e o campus universitário',
}

function flat(text: string) {
  return StyleSheet.flatten(screen.getByText(text).props.style)
}

describe('RouteCard', () => {
  it('name in title, no emoji; origin → destination with the arrow icon', async () => {
    await renderUi(<RouteCard route={ROUTE} />)

    const name = screen.getByText('Linha Centro - Universidade')
    expect(StyleSheet.flatten(name.props.style)).toMatchObject({
      fontSize: typography.title.fontSize,
      fontFamily: typography.title.fontFamily,
      color: lightPalette.text,
    })
    expect(name.props.children).toBe('Linha Centro - Universidade')

    expect(screen.getByText('Centro')).toBeTruthy()
    expect(screen.getByText('Campus Universitário')).toBeTruthy()
    const arrow = screen
      .getByTestId('route-card-path', hidden)
      .findAll((node: TestNode) => typeof node.props.name === 'string')[0]
    expect(arrow?.props.name).toBe('arrow-right')
  })

  it('description in body, never italic, no uppercase labels', async () => {
    await renderUi(<RouteCard route={ROUTE} />)

    const description = flat(ROUTE.description!)
    expect(description.fontSize).toBe(typography.body.fontSize)
    expect(description.fontStyle).toBeUndefined()
    for (const label of ['Origem', 'Destino', 'Descrição', 'ORIGEM', 'DESTINO']) {
      expect(screen.queryByText(label)).toBeNull()
    }
    for (const text of ['Linha Centro - Universidade', 'Centro', 'Campus Universitário']) {
      expect(flat(text).textTransform).toBeUndefined()
      expect(flat(text).fontStyle).toBeUndefined()
    }
  })

  it('no description line when it is null', async () => {
    await renderUi(<RouteCard route={{ ...ROUTE, description: null }} />)
    expect(screen.queryByTestId('route-card-description')).toBeNull()
  })

  it('level-1 card on the palette surface', async () => {
    await renderUi(<RouteCard route={ROUTE} />)
    expect(StyleSheet.flatten(screen.getByTestId('route-card').props.style)).toMatchObject({
      backgroundColor: lightPalette.surface,
      borderColor: lightPalette.hairline,
      borderRadius: radius.lg,
    })
  })

  it('one accessible node labelled "<name>, de <origin> para <destination>"', async () => {
    await renderUi(<RouteCard route={{ ...ROUTE, description: null }} />)
    const card = screen.getByTestId('route-card')
    expect(card.props.accessible).toBe(true)
    expect(card.props.accessibilityLabel).toBe(
      'Linha Centro - Universidade, de Centro para Campus Universitário',
    )
  })

  it('the label carries the description, which the grouped node would otherwise hide', () => {
    expect(routeAccessibilityLabel(ROUTE)).toBe(
      'Linha Centro - Universidade, de Centro para Campus Universitário. Rota matutina entre o centro e o campus universitário',
    )
  })
})
