import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
// Spies exposed by the jest.setup.js mock, not part of the real package.
// @ts-expect-error mock-only export
import { mapCommands } from 'react-native-maps'

import { BusMap } from '@/components/track-bus/bus-map'
import { isGoogleMapsConfigured } from '@/lib/maps-config'

jest.mock('@/lib/maps-config', () => ({ isGoogleMapsConfigured: jest.fn(() => true) }))

// The map is ONE accessible element (its label says what it shows); the
// markers inside are hidden from assistive tech on purpose.
const HIDDEN = { includeHiddenElements: true }

const BUS = { latitude: -20.7555, longitude: -42.8817 }
const STUDENT = { latitude: -20.76, longitude: -42.89 }

describe('BusMap (story 7.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(isGoogleMapsConfigured).mockReturnValue(true)
  })

  it('markers are hidden from assistive tech: the map is one labeled element', () => {
    render(<BusMap bus={BUS} student={STUDENT} stale={false} />)

    expect(screen.queryByTestId('bus-map-bus-marker')).toBeNull()
    expect(screen.getByTestId('bus-map-bus-marker', HIDDEN)).toBeTruthy()
  })

  it('shows the bus and the student markers', () => {
    render(<BusMap bus={BUS} student={STUDENT} stale={false} />)

    expect(screen.getByTestId('bus-map-bus-marker', HIDDEN).props.coordinate).toEqual(BUS)
    expect(screen.getByTestId('bus-map-student-marker', HIDDEN).props.coordinate).toEqual(STUDENT)
    expect(screen.getByLabelText('Mapa com a posição do ônibus e a sua')).toBeTruthy()
  })

  it('without the student fix: only the bus marker', () => {
    render(<BusMap bus={BUS} student={null} stale={false} />)

    expect(screen.getByTestId('bus-map-bus-marker', HIDDEN)).toBeTruthy()
    expect(screen.queryByTestId('bus-map-student-marker', HIDDEN)).toBeNull()
    expect(screen.getByLabelText('Mapa com a posição do ônibus')).toBeTruthy()
  })

  it('GPS signal lost: the bus marker stays at its last point, dimmed', () => {
    const { rerender } = render(<BusMap bus={BUS} student={null} stale={false} />)
    expect(screen.getByTestId('bus-map-bus-marker', HIDDEN).props.opacity).toBe(1)

    rerender(<BusMap bus={BUS} student={null} stale />)

    const marker = screen.getByTestId('bus-map-bus-marker', HIDDEN)
    expect(marker.props.coordinate).toEqual(BUS)
    expect(marker.props.opacity).toBeLessThan(1)
    expect(screen.getByLabelText(/sem sinal GPS no momento/)).toBeTruthy()
  })

  it('the native marker gets only the coordinate, not the BusPosition extras', () => {
    const position = { ...BUS, accuracy: 12, at: '2026-09-27T12:00:00Z' }
    render(<BusMap bus={position} student={null} stale={false} />)

    expect(screen.getByTestId('bus-map-bus-marker', HIDDEN).props.coordinate).toEqual(BUS)
  })

  it('without the Google Maps key: renders nothing and never mounts the MapView', () => {
    jest.mocked(isGoogleMapsConfigured).mockReturnValue(false)

    render(<BusMap bus={BUS} student={STUDENT} stale={false} />)

    expect(screen.queryByTestId('bus-map')).toBeNull()
    expect(screen.queryByTestId('mock-map-view')).toBeNull()
  })

  describe('camera', () => {
    const mapReady = () => act(() => fireEvent(screen.getByTestId('mock-map-view', HIDDEN), 'mapReady'))
    const regionSettles = (region: object) =>
      act(() => fireEvent(screen.getByTestId('mock-map-view', HIDDEN), 'regionChangeComplete', region))
    const REGION_AROUND_BUS = { ...BUS, latitudeDelta: 0.01, longitudeDelta: 0.01 }

    it('no command before the map is ready', () => {
      render(<BusMap bus={BUS} student={STUDENT} stale={false} />)

      expect(mapCommands.fitToCoordinates).not.toHaveBeenCalled()
      expect(mapCommands.animateToRegion).not.toHaveBeenCalled()
    })

    it('on ready with the student: fits both points once', () => {
      render(<BusMap bus={BUS} student={STUDENT} stale={false} />)
      mapReady()

      expect(mapCommands.fitToCoordinates).toHaveBeenCalledTimes(1)
      expect(mapCommands.fitToCoordinates.mock.calls[0][0]).toEqual([BUS, STUDENT])
    })

    it('on ready without the student: centers on the bus', () => {
      render(<BusMap bus={BUS} student={null} stale={false} />)
      mapReady()

      expect(mapCommands.animateToRegion).toHaveBeenCalledWith(REGION_AROUND_BUS)
      expect(mapCommands.fitToCoordinates).not.toHaveBeenCalled()
    })

    it('student on the same spot as the bus: centers instead of fitting zero-size bounds', () => {
      render(<BusMap bus={BUS} student={BUS} stale={false} />)
      mapReady()

      expect(mapCommands.fitToCoordinates).not.toHaveBeenCalled()
      expect(mapCommands.animateToRegion).toHaveBeenCalledTimes(1)
    })

    it('the student fix showing up reframes to both points', () => {
      const { rerender } = render(<BusMap bus={BUS} student={null} stale={false} />)
      mapReady()
      rerender(<BusMap bus={BUS} student={STUDENT} stale={false} />)

      expect(mapCommands.fitToCoordinates).toHaveBeenCalledTimes(1)
    })

    it('bus moving inside the visible region: the camera stays put', () => {
      const { rerender } = render(<BusMap bus={BUS} student={STUDENT} stale={false} />)
      mapReady()
      regionSettles({ ...BUS, latitudeDelta: 0.1, longitudeDelta: 0.1 })
      jest.clearAllMocks()

      rerender(<BusMap bus={{ latitude: -20.756, longitude: -42.882 }} student={STUDENT} stale={false} />)

      expect(mapCommands.fitToCoordinates).not.toHaveBeenCalled()
      expect(mapCommands.animateToRegion).not.toHaveBeenCalled()
      expect(mapCommands.animateCamera).not.toHaveBeenCalled()
    })

    it('bus leaving the visible region: reframes, keeping the student in view', () => {
      const { rerender } = render(<BusMap bus={BUS} student={STUDENT} stale={false} />)
      mapReady()
      regionSettles({ ...BUS, latitudeDelta: 0.1, longitudeDelta: 0.1 })
      jest.clearAllMocks()

      const farBus = { latitude: -20.9, longitude: -43.1 }
      rerender(<BusMap bus={farBus} student={STUDENT} stale={false} />)

      expect(mapCommands.fitToCoordinates).toHaveBeenCalledTimes(1)
      expect(mapCommands.fitToCoordinates.mock.calls[0][0]).toEqual([farBus, STUDENT])
    })

    it('bus leaving before any region report: the seeded initial region still catches it', () => {
      const { rerender } = render(<BusMap bus={BUS} student={null} stale={false} />)
      mapReady()
      jest.clearAllMocks()

      rerender(<BusMap bus={{ latitude: -20.9, longitude: -43.1 }} student={null} stale={false} />)

      expect(mapCommands.animateToRegion).toHaveBeenCalledTimes(1)
    })
  })
})
