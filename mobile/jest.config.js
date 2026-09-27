// Runs without a device, emulator, network, Docker or `.env` (story 1.10).
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
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
