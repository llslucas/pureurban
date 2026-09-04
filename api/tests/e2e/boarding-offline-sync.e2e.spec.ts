/**
 * Épico 3 — check-in offline com fila de sincronização, sem duplicata.
 *
 * Fluxo pela UI do motorista:
 *   1. `context.setOffline(true)` → escaneia QR válido → o check-in é enfileirado
 *      e o banner global "Modo Offline" aparece (nenhum 4xx/5xx na tela).
 *   2. `context.setOffline(false)` → a fila drena sozinha (backoff) e um
 *      `POST /boarding/check-in` chega ao servidor com 201; o banner some.
 *   3. O servidor tem EXATAMENTE um CHECKED_IN para o aluno — o dreno não
 *      duplicou apesar das tentativas com a mesma `X-Idempotency-Key`.
 *   4. A idempotência é do endpoint: a mesma key reenviada devolve 201 sem
 *      criar um segundo registro.
 *
 * Por que a checagem final é via API e não pelo DOM da lista: o dreno da fila
 * (use-offline-sync.ts) não invalida o cache do roster — só o caminho ONLINE do
 * scan faz (AC #4 da 3.5b) — e sob Playwright o `refetchOnReconnect` do TanStack
 * Query não dispara de forma confiável (`context.setOffline` é CDP puro, sem os
 * eventos que o app usa para revalidar). `GET /trips/:id/students` é a fonte da
 * contagem que a lista renderiza, então asseverá-lo prova a AC "aparece
 * exatamente uma vez".
 *
 * Caveat: a fila do web usa wa-sqlite. Passou headless na verificação da 3.6,
 * mas a persistência via OPFS depende dos headers COOP/COEP do dev server; se um
 * ambiente não os servir, rode headed (`npm run test:pw:headed`). Ver
 * tests/README.md.
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

test.describe('Épico 3 — offline → reconexão → sync sem duplicata', () => {
  // Os specs do projeto `e2e` dividem um único Expo dev server e rodam seriais
  // (playwright.config.ts: fullyParallel:false + --workers=1). O retry cobre uma
  // revalidação lenta do Metro sob carga — ambiente, não regressão.
  test.describe.configure({ retries: process.env.CI ? 2 : 1 });

  test.beforeAll(async () => {
    const reason = await e2eServersUnavailable();
    test.skip(reason !== null, reason ?? '');
  });

  test('check-in offline sincroniza uma única vez', async ({
    page,
    context,
    request,
    epic3,
  }) => {
    const tripRes = await request.post('/api/v1/trips', {
      data: { routeId: epic3.routeId, type: 'OUTBOUND' },
      headers: { Authorization: `Bearer ${epic3.driverToken}` },
    });
    expect(tripRes.status(), await tripRes.text()).toBe(201);
    const tripId = ((await tripRes.json()) as { data: { id: string } }).data.id;
    const total = epic3.studentIds.length;
    const [studentId] = epic3.studentIds;

    await loginAsDriver(page, epic3.driver);
    await openScanner(page);

    // ---- Offline: o check-in vai para a fila ----
    await context.setOffline(true);
    await injectScan(page, encodeQr(studentId));
    await expect(page.getByText(/Modo Offline/)).toBeVisible();
    // Enfileirado, não rejeitado: nada de overlay de erro de negócio.
    await expect(page.getByText('QR code inválido')).toBeHidden();

    // ---- Reconexão: a fila drena até o servidor ----
    const drain201 = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/boarding/check-in') &&
        res.request().method() === 'POST' &&
        res.status() === 201,
    );
    await context.setOffline(false);
    // `context.setOffline` é CDP puro e não redispara o evento `online` do DOM,
    // que é o que o `connectivity.ts` do app escuta para acordar o dreno.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await drain201;
    await expect(page.getByText(/Modo Offline/)).toBeHidden();

    // ---- O servidor registrou o embarque exatamente uma vez ----
    const list = await request.get(`/api/v1/trips/${tripId}/students`, {
      headers: { Authorization: `Bearer ${epic3.driverToken}` },
    });
    const body = (await list.json()) as {
      data: {
        students: { studentId: string; status: string }[];
        summary: { boarded: number; total: number };
      };
    };
    expect(body.data.summary).toEqual({ boarded: 1, total });
    const checkedIn = body.data.students.filter((s) => s.status === 'CHECKED_IN');
    expect(checkedIn).toHaveLength(1);
    expect(checkedIn[0].studentId).toBe(studentId);

    // ---- Idempotência do endpoint: a mesma key reenviada não duplica ----
    const key = randomUUID();
    const other = epic3.studentIds[1];
    const first = await request.post('/api/v1/boarding/check-in', {
      data: { studentId: other, tripId },
      headers: {
        Authorization: `Bearer ${epic3.driverToken}`,
        'X-Idempotency-Key': key,
      },
    });
    const replay = await request.post('/api/v1/boarding/check-in', {
      data: { studentId: other, tripId },
      headers: {
        Authorization: `Bearer ${epic3.driverToken}`,
        'X-Idempotency-Key': key,
      },
    });
    expect(first.status()).toBe(201);
    expect(replay.status()).toBe(201);
    const after = await request.get(`/api/v1/trips/${tripId}/students`, {
      headers: { Authorization: `Bearer ${epic3.driverToken}` },
    });
    const afterBody = (await after.json()) as {
      data: { summary: { boarded: number } };
    };
    expect(afterBody.data.summary.boarded).toBe(2);
  });
});
