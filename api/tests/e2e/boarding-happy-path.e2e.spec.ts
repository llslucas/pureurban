/**
 * Épico 3 — caminho feliz ponta a ponta contra a API real (sem MSW).
 *
 * Motorista faz login → viagem ativa (semeada via API) → abre a câmera →
 * QR injetado → check-in 201 → overlay de sucesso → lista de alunos mostra
 * CHECKED_IN e a contagem `{boarded,total}` incrementa. Também cobre NFR1:
 * `POST /boarding/check-in` responde em menos de 2s.
 */
import { test, expect } from '../support/merged-fixtures';
import { e2eServersUnavailable } from '../support/helpers/e2e-servers';
import {
  encodeQr,
  injectScan,
  loginAsDriver,
  openScanner,
} from '../support/helpers/e2e-driver';

// Teto da NFR1. Mede só a chamada de rede (não o render), com folga de ambiente
// local documentada — mesmo critério da Task 9.3 da 3.5a.
const NFR1_BUDGET_MS = 2000;

test.describe('Épico 3 — caminho feliz', () => {
  // Os specs do projeto `e2e` dividem um único Expo dev server e rodam seriais
  // (playwright.config.ts: fullyParallel:false + --workers=1). O retry cobre uma
  // revalidação lenta do Metro sob carga — ambiente, não regressão.
  test.describe.configure({ retries: process.env.CI ? 2 : 1 });

  test.beforeAll(async () => {
    const reason = await e2eServersUnavailable();
    test.skip(reason !== null, reason ?? '');
  });

  test('motorista escaneia e o embarque aparece na lista', async ({
    page,
    request,
    epic3,
  }) => {
    // Viagem semeada via API para manter o teste determinístico e independente
    // do estado de rotas do seed; o app apenas reflete `GET /trips/active`.
    const tripRes = await request.post('/api/v1/trips', {
      data: { routeId: epic3.routeId, type: 'OUTBOUND' },
      headers: { Authorization: `Bearer ${epic3.driverToken}` },
    });
    expect(tripRes.status(), await tripRes.text()).toBe(201);
    const total = epic3.studentIds.length;
    const [studentId] = epic3.studentIds;

    await loginAsDriver(page, epic3.driver);
    // A tela de Viagem reflete a viagem real e a contagem do servidor.
    await expect(page.getByText(`Alunos: 0/${total}`)).toBeVisible();
    await openScanner(page);

    const checkInResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/boarding/check-in') &&
        res.request().method() === 'POST',
    );
    await injectScan(page, encodeQr(studentId));

    const response = await checkInResponse;
    expect(response.status()).toBe(201);

    // NFR1 mede SÓ a chamada de rede — não o render nem os round-trips de CDP do
    // `injectScan`. O `timing()` do resource só fica populado depois do
    // `requestfinished`; `responseEnd - requestStart` é o tempo de servidor.
    await response.finished();
    const timing = response.request().timing();
    const networkMs = timing.responseEnd - timing.requestStart;
    // eslint-disable-next-line no-console
    console.log(
      `[NFR1] POST /boarding/check-in → ${networkMs.toFixed(0)}ms (budget ${NFR1_BUDGET_MS}ms)`,
    );
    expect(networkMs).toBeGreaterThan(0);
    expect(networkMs).toBeLessThan(NFR1_BUDGET_MS);

    await expect(page.getByText('Embarque confirmado')).toBeVisible();

    await page.getByRole('button', { name: 'Ver lista' }).click();
    await expect(page.getByText(`1/${total} embarcados`)).toBeVisible();
    await expect(page.getByText('Embarcou').first()).toBeVisible();
  });
});
