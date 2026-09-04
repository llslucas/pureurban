/**
 * Épico 3 — rejeição de QR inválido e de aluno não permitido.
 *
 * - Raw que não decodifica para `{studentId,sessionId}` UUID → feedback
 *   INVALID_QR_CODE local, SEM tocar a rede.
 * - QR bem-formado com `studentId` fora do roster → check-in 403
 *   STUDENT_NOT_ALLOWED, feedback distinto.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from '../support/merged-fixtures';
import { e2eServersUnavailable } from '../support/helpers/e2e-servers';
import {
  encodeQr,
  injectScan,
  loginAsDriver,
  openScanner,
} from '../support/helpers/e2e-driver';

test.describe('Épico 3 — QR inválido / aluno não permitido', () => {
  // Os specs do projeto `e2e` dividem um único Expo dev server e rodam seriais
  // (playwright.config.ts: fullyParallel:false + --workers=1). O retry cobre uma
  // revalidação lenta do Metro sob carga — ambiente, não regressão.
  test.describe.configure({ retries: process.env.CI ? 2 : 1 });

  test.beforeAll(async () => {
    const reason = await e2eServersUnavailable();
    test.skip(reason !== null, reason ?? '');
  });

  test.beforeEach(async ({ page, request, epic3 }) => {
    const tripRes = await request.post('/api/v1/trips', {
      data: { routeId: epic3.routeId, type: 'OUTBOUND' },
      headers: { Authorization: `Bearer ${epic3.driverToken}` },
    });
    expect(tripRes.status(), await tripRes.text()).toBe(201);
    await loginAsDriver(page, epic3.driver);
    await openScanner(page);
  });

  test('raw não-PureUrban → INVALID_QR_CODE, sem requisição de rede', async ({ page }) => {
    let checkInHit = false;
    page.on('request', (req) => {
      if (
        req.url().includes('/api/v1/boarding/check-in') &&
        req.method() === 'POST'
      )
        checkInHit = true;
    });

    await injectScan(page, 'https://example.com/not-a-pureurban-qr');

    await expect(page.getByText('QR code inválido')).toBeVisible();
    // Sem espera arbitrária: se um POST fosse disparar, seria síncrono ao submit.
    await page.waitForTimeout(500);
    expect(checkInHit).toBe(false);
  });

  test('studentId UUID fora do roster → STUDENT_NOT_ALLOWED', async ({ page }) => {
    const checkInResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/boarding/check-in') &&
        res.request().method() === 'POST',
    );

    await injectScan(page, encodeQr(randomUUID()));

    const response = await checkInResponse;
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('STUDENT_NOT_ALLOWED');
    // Feedback distinto do INVALID_QR_CODE local (ver scan-feedback.ts).
    await expect(page.getByText('Aluno não autorizado')).toBeVisible();
  });
});
