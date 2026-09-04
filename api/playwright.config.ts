import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PureUrban API & E2E tests.
 *
 * - Project "api": pure API tests (no browser) — testes de integração REST
 * - Project "e2e": browser-based E2E tests (Épico 3) — dirige o Expo Web
 *   (localhost:8081) contra a API real (localhost:3000)
 *
 * Sem `webServer`: subir API + Expo Web juntos pelo Playwright provou-se frágil
 * (o bundle inicial do Expo Web leva minutos e não sinaliza "pronto" de forma
 * confiável). Os specs do Épico 3 assumem os dois servidores como pré-requisito
 * manual (ver tests/README.md) e se AUTO-SKIPAM quando ausentes, via
 * `e2eServersUnavailable()` / `apiUnavailable()` — assim o gate `test:pw:api`
 * continua verde numa máquina sem a infra. `E2E_SERVERS_UP=1` vira falha.
 *
 * Concorrência do projeto `e2e`: os specs dividem UM único Expo dev server, então
 * rodam SERIAIS. `TestProject` no Playwright 1.58 não aceita `workers` por
 * projeto, então isto é feito por duas metades: `fullyParallel: false` aqui
 * (serial dentro de cada arquivo) + `--workers=1` nos scripts que executam o
 * projeto `e2e` (test:pw, test:pw:e2e, test:pw:headed; test:pw:debug já força 1).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: {
        // No browser — pure API testing
      },
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      // Um só Expo dev server compartilhado — nunca paralelo entre arquivos.
      fullyParallel: false,
      use: {
        ...devices['Desktop Chrome'],
        // Metro compila o bundle no primeiro acesso e "leva minutos"; o default
        // de 30s de navegação estoura em `loginAsDriver` (page.goto) a frio.
        navigationTimeout: 120_000,
        // A tela de scan do motorista abre a câmera via getUserMedia mesmo no
        // web; sem uma câmera falsa o headless nega a permissão e a tela cai no
        // estado "Permissão da câmera" — o hook de injeção nunca monta.
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
  ],

  /* Timeout configuration */
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
});
