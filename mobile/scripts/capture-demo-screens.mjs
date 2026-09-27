#!/usr/bin/env node
// Regenerates the "after" screenshots of the UX audit (story 6.12, D-UX-13):
// same file names and same states as `audit/`, rendered by the current app.
//
// Prerequisite: Expo Web serving the app with MSW mocks and the scan hook:
//   cd mobile && EXPO_PUBLIC_USE_MOCKS=1 EXPO_PUBLIC_E2E=1 npx expo start --web --port 8081
// Then, from the repo root:
//   node mobile/scripts/capture-demo-screens.mjs [name-filter ...]
//
// Env: CAPTURE_BASE_URL (default http://localhost:8081), CAPTURE_OUT_DIR.
// Playwright comes from api/node_modules: mobile/ does not depend on it.

import { createRequire } from 'node:module'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const require = createRequire(path.join(repoRoot, 'api/package.json'))
const { chromium } = require('@playwright/test')

const BASE_URL = process.env.CAPTURE_BASE_URL ?? 'http://localhost:8081'
const OUT_DIR =
  process.env.CAPTURE_OUT_DIR ??
  path.join(repoRoot, '_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/after')

const PASSWORD = 'senha123'
const DOMAIN = '@pureurban.com'
// Ana Souza's studentId in the mock roster (`boarding.handlers.ts`). The
// sessionId is fixed so every run injects the same raw QR string.
const ANA_QR = JSON.stringify({
  studentId: '660e8400-e29b-41d4-a716-446655440010',
  sessionId: '00000000-0000-4000-8000-000000000612',
})
const INVALID_QR = 'https://example.com/not-a-pureurban-qr'

// Reanimated transitions (overlay fade, counter roll, skeleton cross-fade) run
// in JS on web; this lets the frame settle before the shot.
const SETTLE_MS = 900
const STEP_TIMEOUT_MS = 30_000

async function login(page, user) {
  await page.goto(BASE_URL)
  await page.locator('#login-email').waitFor({ timeout: 120_000 })
  await page.locator('#login-email').fill(`${user}${DOMAIN}`)
  await page.locator('#login-password').fill(PASSWORD)
  await page.locator('#login-submit').click()
}

async function loginDriver(page, user = 'motorista') {
  await login(page, user)
  await page.getByTestId('trip-screen').first().waitFor({ timeout: STEP_TIMEOUT_MS })
}

async function loginStudent(page, user = 'aluno') {
  await login(page, user)
  await page.getByTestId('student-home').waitFor({ timeout: STEP_TIMEOUT_MS })
}

async function openScanner(page) {
  await page.getByRole('button', { name: 'Escanear QR Code' }).click()
  await page.getByText(/embarques? nesta sessão/).waitFor({ timeout: STEP_TIMEOUT_MS })
}

async function injectScan(page, raw) {
  await page.waitForFunction(() => typeof globalThis.__E2E_INJECT_SCAN__ === 'function', null, {
    timeout: STEP_TIMEOUT_MS,
  })
  await page.evaluate((value) => globalThis.__E2E_INJECT_SCAN__(value), raw)
}

async function scanAnaAndResume(page) {
  await openScanner(page)
  await injectScan(page, ANA_QR)
  await page.getByRole('button', { name: 'Escanear próximo' }).click()
  await page.getByText('1 embarque nesta sessão').waitFor({ timeout: STEP_TIMEOUT_MS })
}

async function openStudentList(page) {
  await page.getByTestId('trip-students-link').click()
  await page.getByTestId('roster-counter').waitFor({ timeout: STEP_TIMEOUT_MS })
}

// The app is a single-page app, and MSW keeps the logged-in e-mail (which drives
// every sentinel) in memory: a `page.goto` would reload and drop it. Routes with
// no in-app entry are reached through the History API instead, which Expo
// Router's web linking follows.
async function navigateInApp(page, pathname) {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }, pathname)
}

const loginShots = (scheme) => [
  {
    name: `${scheme}-01-login`,
    colorScheme: scheme,
    run: async (page) => {
      await page.goto(BASE_URL)
      await page.locator('#login-email').waitFor({ timeout: 120_000 })
    },
  },
  {
    name: `${scheme}-02-login-erro-vazio`,
    colorScheme: scheme,
    run: async (page) => {
      await page.goto(BASE_URL)
      await page.locator('#login-submit').click()
      await page.getByTestId('login-error').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: `${scheme}-10-trip-encerrada-sentinela`,
    colorScheme: scheme,
    run: (page) => loginDriver(page, 'motorista-viagem-encerrada'),
  },
]

const LIGHT_AND_LOGIN_CAPTURES = [
  ...loginShots('light'),
  // The OS in dark mode: the app follows the scheme since story 6.14.
  ...loginShots('dark'),
  {
    name: 'light-11-trip-ativa',
    run: (page) => loginDriver(page),
  },
  {
    name: 'light-12-student-list',
    run: async (page) => {
      await loginDriver(page)
      await openStudentList(page)
    },
  },
  {
    name: 'light-13-scan-idle',
    run: async (page) => {
      await loginDriver(page)
      await openScanner(page)
    },
  },
  {
    name: 'light-14-scan-sucesso',
    run: async (page) => {
      await loginDriver(page)
      await openScanner(page)
      await injectScan(page, ANA_QR)
      await page.getByRole('button', { name: 'Escanear próximo' }).waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-15-scan-qr-invalido',
    run: async (page) => {
      await loginDriver(page)
      await openScanner(page)
      await injectScan(page, INVALID_QR)
      await page.getByText('QR code inválido').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    // Same raw QR a second time, as in the audit run.
    name: 'light-16-scan-segundo-mesmo-aluno',
    run: async (page) => {
      await loginDriver(page)
      await scanAnaAndResume(page)
      await injectScan(page, ANA_QR)
      // A discarded repeat leaves no signal to wait for: give it time, then
      // assert the scanner is still idle on the first check-in.
      await page.waitForTimeout(1500)
      await page.getByText('1 embarque nesta sessão').waitFor({ timeout: STEP_TIMEOUT_MS })
      if (await page.getByRole('button', { name: 'Escanear próximo' }).count()) {
        throw new Error('repeat scan opened an overlay instead of being discarded')
      }
    },
  },
  {
    name: 'light-17-student-list-apos-checkin',
    run: async (page) => {
      await loginDriver(page)
      await scanAnaAndResume(page)
      await page.getByRole('button', { name: 'Ver lista' }).click()
      await page
        .locator('[data-testid="roster-counter"][aria-label^="1 de 3"]')
        .waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    // `(driver)/routes` has no entry point in the app (EXPERIENCE.md, D-UX-6).
    name: 'light-18-routes',
    run: async (page) => {
      await loginDriver(page)
      await navigateInApp(page, '/routes')
      await page.getByText('Linha Centro - Universidade').first().waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    // Outbound trip with one check-in, ended through the confirm dialog.
    name: 'light-19-trip-encerrada-ida',
    run: async (page) => {
      await loginDriver(page)
      await scanAnaAndResume(page)
      await page.goBack()
      await page.getByRole('button', { name: 'Encerrar Viagem' }).click()
      await page.getByTestId('end-trip-dialog').waitFor({ timeout: STEP_TIMEOUT_MS })
      await page.getByRole('button', { name: 'Encerrar', exact: true }).click()
      await page.getByTestId('end-trip-dialog').waitFor({ state: 'hidden', timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-20-trip-turma-vazia',
    run: (page) => loginDriver(page, 'motorista-turma-vazia'),
  },
  {
    name: 'light-21-student-list-vazia',
    run: async (page) => {
      await loginDriver(page, 'motorista-turma-vazia')
      await page.getByTestId('trip-students-link').click()
      await page.getByTestId('roster-empty').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-22-student-list-60',
    run: async (page) => {
      await loginDriver(page, 'motorista-turma-grande')
      await openStudentList(page)
    },
  },
  {
    name: 'light-23-trip-sem-viagem',
    run: async (page) => {
      await loginDriver(page, 'motorista-sem-viagem')
      await page.getByTestId('start-trip-action').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    // No active trip means no scan button: reach the route directly.
    name: 'light-24-scan-sem-viagem',
    run: async (page) => {
      await loginDriver(page, 'motorista-sem-viagem')
      await page.getByTestId('start-trip-action').waitFor({ timeout: STEP_TIMEOUT_MS })
      await navigateInApp(page, '/scan')
      await page.getByRole('button', { name: 'Ir para Viagem' }).waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-30-student-home',
    run: (page) => loginStudent(page),
  },
  {
    name: 'light-31-qr-code',
    run: async (page) => {
      await loginStudent(page)
      await page.getByTestId('home-qr-shortcut').click()
      await page.getByTestId('qr-route-name').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-32-track-bus',
    run: async (page) => {
      await loginStudent(page)
      await page.getByTestId('home-track-shortcut').click()
      // The mock has no tracking handlers, so the trip query errors after its
      // retries, as in the audit run; any settled state is accepted.
      await page
        .getByTestId('track-bus-screen')
        .or(page.getByText(/Não foi possível carregar sua viagem|Nenhuma viagem ativa/))
        .first()
        .waitFor({ timeout: 90_000 })
    },
  },
  {
    name: 'light-33-dialog-nao-vou-voltar',
    run: async (page) => {
      await loginStudent(page)
      await page.getByTestId('home-not-returning').click()
      await page.getByTestId('home-not-returning-dialog').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-34-ausencia-registrada',
    run: async (page) => {
      await loginStudent(page)
      await page.getByTestId('home-not-returning').click()
      await page.getByTestId('home-not-returning-dialog').waitFor({ timeout: STEP_TIMEOUT_MS })
      await page.getByRole('button', { name: 'Avisar motorista' }).click()
      await page.getByTestId('home-not-returning-dialog').waitFor({ state: 'hidden', timeout: STEP_TIMEOUT_MS })
      await page
        .getByText(/Não foi possível registrar a ausência|Motorista avisado/)
        .first()
        .waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    name: 'light-35-qr-sem-rota',
    run: async (page) => {
      await loginStudent(page, 'aluno-sem-rota')
      await page.getByTestId('home-qr-shortcut').click()
      await page.getByTestId('qr-route-empty').waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
  {
    // "Sair" exists both before and after the 6.13 redesign.
    name: 'light-40-admin',
    run: async (page) => {
      await login(page, 'admin')
      await page.getByText('Sair', { exact: true }).waitFor({ timeout: STEP_TIMEOUT_MS })
    },
  },
]

// P0 screens re-shot with the OS in dark mode (story 6.14): same flow as the
// light twin, only the context's color scheme changes.
const DARK_P0 = ['11', '12', '13', '14', '30', '31', '32', '33']

const darkTwins = LIGHT_AND_LOGIN_CAPTURES.filter((shot) =>
  DARK_P0.some((id) => shot.name.startsWith(`light-${id}-`)),
).map((shot) => ({ ...shot, name: shot.name.replace(/^light-/, 'dark-'), colorScheme: 'dark' }))

// A DARK_P0 id without a light twin would otherwise vanish from the run.
if (darkTwins.length !== DARK_P0.length) {
  throw new Error(`DARK_P0 has ${DARK_P0.length} ids but ${darkTwins.length} light twins were found`)
}

const CAPTURES = [...LIGHT_AND_LOGIN_CAPTURES, ...darkTwins]

async function capture(browser, shot) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: shot.colorScheme ?? 'light',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Geolocation granted like on the demo devices; without it the trip screen
    // opens with the location permission card, a state the unit tests pin.
    permissions: ['camera', 'geolocation'],
    geolocation: { latitude: -23.5505, longitude: -46.6333 },
  })
  const page = await context.newPage()
  const file = path.join(OUT_DIR, `${shot.name}.png`)
  // A failed capture must not leave an earlier run's PNG looking current.
  rmSync(file, { force: true })
  try {
    await shot.run(page)
    await page.waitForTimeout(SETTLE_MS)
    await page.screenshot({ path: file })
    if (statSync(file).size === 0) throw new Error('empty PNG')
    return file
  } finally {
    await context.close()
  }
}

async function main() {
  const filters = process.argv.slice(2)
  const selected = filters.length
    ? CAPTURES.filter((c) => filters.some((f) => c.name.includes(f)))
    : CAPTURES
  if (selected.length === 0) {
    console.error(`No capture matches: ${filters.join(', ')}`)
    process.exit(2)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const failures = []
  try {
    for (const shot of selected) {
      try {
        const file = await capture(browser, shot)
        console.log(`ok    ${shot.name} -> ${path.relative(repoRoot, file)}`)
      } catch (error) {
        failures.push(shot.name)
        console.error(`FAIL  ${shot.name}: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`\n${selected.length - failures.length}/${selected.length} captured`)
  if (failures.length) {
    console.error(`failed: ${failures.join(', ')}`)
    process.exit(1)
  }
}

await main()
