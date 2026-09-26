/**
 * Helpers de UI para os specs E2E do Épico 3 — dirigem o Expo Web do motorista.
 *
 * O QR é injetado por `globalThis.__E2E_INJECT_SCAN__` (registrado por
 * `scan.tsx` sob `__DEV__ && EXPO_PUBLIC_E2E === '1'`): o E2E roda só no web e
 * não tem câmera. Ver Design Notes da Story 3.6.
 */
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { EXPO_WEB_URL } from './e2e-servers';
import type { Epic3Credentials } from './seed-helpers';

/** Reproduz `encodeQrPayload` do mobile: JSON com ordem de chaves fixa. */
export function encodeQr(studentId: string, sessionId = randomUUID()): string {
  return JSON.stringify({ studentId, sessionId });
}

/** Abre o app, faz login do motorista e espera a tela de Viagem. */
export async function loginAsDriver(
  page: Page,
  creds: Epic3Credentials,
): Promise<void> {
  await page.goto(EXPO_WEB_URL);
  // React Native Paper no web não associa <label> ao <input> (getByLabel falha);
  // o `id` do TextInput vira o id do DOM.
  await page.locator('#login-email').fill(creds.email);
  await page.locator('#login-password').fill(creds.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('trip-screen')).toBeVisible({
    timeout: 30_000,
  });
}

/** Da tela de Viagem para a câmera de scan. */
export async function openScanner(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Escanear QR Code' }).click();
  // A barra de contagem só aparece com a câmera montada.
  await expect(page.getByText(/embarque(s)? nesta sessão/)).toBeVisible();
}

/**
 * Mesmo fluxo de `loginAsDriver` — a tela de login é única e o redirecionamento
 * por papel leva o aluno a `/(student)/home`, cujo primeiro elemento estável é
 * o botão "Meu QR Code".
 */
export async function loginAsStudent(
  page: Page,
  creds: Epic3Credentials,
): Promise<void> {
  await page.goto(EXPO_WEB_URL);
  await page.locator('#login-email').fill(creds.email);
  await page.locator('#login-password').fill(creds.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Meu QR Code' })).toBeVisible({
    timeout: 30_000,
  });
}

/** Injeta uma string de QR bruta no handler de scan. */
export async function injectScan(page: Page, raw: string): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof (globalThis as Record<string, unknown>).__E2E_INJECT_SCAN__ ===
      'function',
  );
  await page.evaluate((value) => {
    (
      globalThis as unknown as { __E2E_INJECT_SCAN__: (r: string) => void }
    ).__E2E_INJECT_SCAN__(value);
  }, raw);
}
