// Runner de testes do mobile (Story 1.10). Roda sem device, emulador, rede,
// Docker ou `.env`. A suite inicial cobre logica pura (`role-routes`,
// `qr-payload`) mais um render de primitivo RN que exerce o transform.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx,js,jsx}',
    '<rootDir>/src/**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx}',
  ],
  collectCoverage: false,
};
