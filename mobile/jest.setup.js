// Reanimated 4 needs the native Worklets runtime, which jest-expo doesn't
// provide: swap both for their official mocks. The Reanimated mock leaves
// `useReducedMotion` out ("ADD ME IF NEEDED"), so it is added here; tests flip
// it with `jest.mocked(useReducedMotion).mockReturnValue(true)`.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock')
  return { ...mock, useReducedMotion: jest.fn(() => false) }
})

// react-native-maps is a native view: jest-expo has no Google Maps, so MapView
// and Marker become plain Views that keep their props (tests fire
// onMapReady/onRegionChangeComplete and assert on testID/opacity). The camera
// commands are module-level spies, exposed as `mapCommands` for assertions.
jest.mock('react-native-maps', () => {
  const React = require('react')
  const { View } = require('react-native')
  const mapCommands = {
    fitToCoordinates: jest.fn(),
    animateToRegion: jest.fn(),
    animateCamera: jest.fn(),
  }
  const MapView = React.forwardRef(function MockMapView(props, ref) {
    React.useImperativeHandle(ref, () => mapCommands)
    return React.createElement(View, { ...props, testID: 'mock-map-view' })
  })
  const Marker = (props) => React.createElement(View, props)
  return { __esModule: true, default: MapView, Marker, PROVIDER_GOOGLE: 'google', mapCommands }
})
