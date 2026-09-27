// Runs without a device, emulator, network, Docker or `.env` (story 1.10).
const expoPreset = require('jest-expo/jest-preset');

// ESM-only packages that publish plain `.js` (the `.mjs` ones are caught by extension).
const ESM_ONLY_JS = ['until-async'];

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // msw's dependency chain (rettime, @open-draft/*, ...) ships ESM-only `.mjs`,
  // which the preset neither transforms nor un-ignores: babel takes any `.mjs`.
  transform: {
    ...expoPreset.transform,
    '\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('/node_modules/(?!(', `/node_modules/(?!.*\\.mjs$)(?!(${ESM_ONLY_JS.join('|')}|`),
  ),
  testMatch: [
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx,js,jsx}',
    '<rootDir>/src/**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx}',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverage: false,
  // The default (cores - 1) spawns 31 jest-expo workers on a 32-core WSL box,
  // ~500 MB each, which exhausts WSL's 16 GB and restarts it. Cap both.
  maxWorkers: '25%',
  workerIdleMemoryLimit: '512MB',
};
