// Reanimated 4 needs the native Worklets runtime, which jest-expo doesn't
// provide: swap both for their official mocks. The Reanimated mock leaves
// `useReducedMotion` out ("ADD ME IF NEEDED"), so it is added here; tests flip
// it with `jest.mocked(useReducedMotion).mockReturnValue(true)`.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock')
  return { ...mock, useReducedMotion: jest.fn(() => false) }
})
