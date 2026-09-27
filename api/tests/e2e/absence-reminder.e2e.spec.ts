/**
 * Épico 4 — ausência "não vou voltar" e lembrete, ponta a ponta pela UI contra
 * a API real (sem MSW).
 *
 * Duas páginas em contextos separados sobre a MESMA viagem RETURN semeada via
 * API: o aluno na home (`(student)/home`) e o motorista na lista de embarque
 * (`(driver)/student-list`). Fluxos dependentes de tempo (janela de 2 min,
 * lembrete de 15 min) usam aging de timestamps via Prisma
 * (`support/helpers/prisma-time`) — nunca sono de tempo real nem backdoor de
 * trigger; o lembrete é disparado pelo scheduler real do dev server (tick de
 * 60s) e o spec faz polling do `GET /boarding/reminder`.
 */
import { randomUUID } from 'node:crypto';
import { devices } from '@playwright/test';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/merged-fixtures';
import { API_URL, e2eServersUnavailable } from '../support/helpers/e2e-servers';
import { loginAsDriver, loginAsStudent } from '../support/helpers/e2e-driver';
import { ageAbsence, ageTrip } from '../support/helpers/prisma-time';
import type { Epic3Credentials } from '../support/helpers/seed-helpers';

// Teto da NFR3, medido como WALL-CLOCK do clique em "Avisar motorista" até o
// badge/contagem visível na página do motorista (cross-screen: rede + SSE +
// render). A prova de rede pura <3s já vive no supertest; aqui o budget é
// folgado para o ambiente local — mesmo critério do NFR1 do happy path.
const NFR3_BUDGET_MS = 3000;

// O scheduler do dev server tica a cada 60s; o polling cobre ao menos um tick
// inteiro com folga (timeout >= 90s é parte do desenho da 4.5).
const REMINDER_POLL_TIMEOUT_MS = 90_000;
const REMINDER_POLL_INTERVAL_MS = 2_000;

// `exact`: the roster legend ("1 não vai voltar") and the Snackbar ("… não vai
// voltar no ônibus") also contain the phrase.
const NOT_RETURNING_BADGE = 'Não vai voltar';

// Trip stays mounted under the list with a counter of the same label, so the
// roster counter is always scoped by its testID, never by a bare getByLabel.
async function expectRosterCount(
  page: Page,
  boarded: number,
  total: number,
): Promise<void> {
  await expect(page.getByTestId('roster-counter')).toHaveAttribute(
    'aria-label',
    `${boarded} de ${total} embarcados`,
  );
}

async function openDriverRoster(
  page: Page,
  driver: Epic3Credentials,
  count: { boarded: number; total: number },
): Promise<void> {
  await loginAsDriver(page, driver);
  // "Ver lista" da Code Map: o botão da tela de Viagem que abre a lista
  // (trip.tsx — label "Alunos da Viagem").
  await page.getByRole('button', { name: 'Alunos da Viagem' }).click();
  await expectRosterCount(page, count.boarded, count.total);
}

/**
 * Client-side mirror of `ageAbsence`: the home renders the countdown from the
 * persisted `['studentBoardingStatus', tripId]` entry (GET /boarding/status),
 * which a reload rehydrates before the 10s staleTime lets it refetch. Aging the
 * cached `cancellableUntil` too avoids waiting on that refetch or on the real
 * 2 min window. Edits the TanStack blob persisted in MMKV-web (localStorage
 * under `mmkv.default\`), without touching mobile/src.
 */
async function ageAbsenceInClientCache(
  page: Page,
  tripId: string,
  minutesAgo: number,
): Promise<void> {
  await page.evaluate(
    ({ tripId, minutesAgo }) => {
      const PERSISTER_KEY = 'mmkv.default\\REACT_QUERY_OFFLINE_CACHE';
      const raw = localStorage.getItem(PERSISTER_KEY);
      if (raw === null) {
        throw new Error(`cache persistido ausente em ${PERSISTER_KEY}`);
      }
      const client = JSON.parse(raw) as {
        clientState: {
          queries: Array<{
            queryKey: unknown[];
            state: {
              data: {
                absence: {
                  notifiedAt: string;
                  cancellableUntil: string;
                } | null;
              } | null;
            };
          }>;
        };
      };
      const entry = client.clientState.queries.find(
        (query) =>
          query.queryKey[0] === 'studentBoardingStatus' &&
          query.queryKey[1] === tripId,
      );
      const absence = entry?.state.data?.absence;
      if (!absence) {
        throw new Error(
          `studentBoardingStatus de ${tripId} não encontrada no cache persistido`,
        );
      }
      const deltaMs = minutesAgo * 60_000;
      absence.notifiedAt = new Date(
        Date.parse(absence.notifiedAt) - deltaMs,
      ).toISOString();
      absence.cancellableUntil = new Date(
        Date.parse(absence.cancellableUntil) - deltaMs,
      ).toISOString();
      localStorage.setItem(PERSISTER_KEY, JSON.stringify(client));
    },
    { tripId, minutesAgo },
  );
}

test.describe('Épico 4 — ausência e lembrete', () => {
  // Os specs do projeto `e2e` dividem um único Expo dev server e rodam seriais
  // (playwright.config.ts: fullyParallel:false + --workers=1). O retry cobre uma
  // revalidação lenta do Metro sob carga — ambiente, não regressão.
  test.describe.configure({ retries: process.env.CI ? 2 : 1 });

  test.beforeAll(async () => {
    const reason = await e2eServersUnavailable();
    test.skip(reason !== null, reason ?? '');
  });

  test('aluno confirma ausência, motorista vê em <3s (NFR3) e cancelar na janela reverte', async ({
    page,
    browser,
    epic4,
  }) => {
    test.setTimeout(120_000);
    const student = epic4.students[0];
    const total = epic4.students.length;

    // Contexto do motorista sem herdar as opções do projeto (newContext cru):
    // replica o device do projeto e o timeout de navegação do Metro no
    // primeiro goto (120s no playwright.config.ts não se aplica aqui).
    const driverContext = await browser.newContext({
      ...devices['Desktop Chrome'],
    });
    const driverPage = await driverContext.newPage();
    driverPage.setDefaultNavigationTimeout(120_000);
    try {
      // O motorista JÁ está na lista quando o aluno age: o canal sob teste é o
      // stream SSE (Story 4.2) — o badge em <3s só é possível com o evento
      // entregue, e a contagem vem do cache aplicado pelo próprio handler.
      await openDriverRoster(driverPage, epic4.driver, { boarded: 0, total });

      await loginAsStudent(page, student);
      const notReturning = page.getByRole('button', { name: 'Não vou voltar' });
      await expect(notReturning).toBeVisible();

      await notReturning.click();
      const confirm = page.getByRole('button', { name: 'Avisar motorista' });
      await expect(confirm).toBeVisible();

      const absenceResponse = page.waitForResponse(
        (res) =>
          res.url().includes('/api/v1/boarding/not-returning') &&
          res.request().method() === 'POST',
      );
      // NFR3: t0 é o clique em Avisar motorista — o AC é a EXPERIÊNCIA completa
      // (toque do aluno → tela do motorista), não só a chamada de rede.
      const t0 = Date.now();
      await confirm.click();
      const response = await absenceResponse;
      expect(response.status()).toBe(201);

      const badge = driverPage.getByText(NOT_RETURNING_BADGE, { exact: true });
      await expect(badge).toBeVisible({ timeout: NFR3_BUDGET_MS });
      const nfr3Ms = Date.now() - t0;

      console.log(
        `[NFR3] Avisar motorista → badge/contagem do motorista: ${nfr3Ms}ms (budget ${NFR3_BUDGET_MS}ms)`,
      );
      expect(nfr3Ms).toBeLessThan(NFR3_BUDGET_MS);

      // Contagem ajustada (total exclui o ausente) e toast contextual.
      await expectRosterCount(driverPage, 0, total - 1);
      await expect(
        driverPage.getByText(`${student.name} não vai voltar no ônibus`),
      ).toBeVisible();

      // Home do aluno vira estado registrado com countdown vivo.
      await expect(page.getByText('Motorista avisado')).toBeVisible();
      await expect(page.getByText(/Desfazer em \d{1,2}:\d{2}/)).toBeVisible();

      // Desfazer dentro da janela: o rodapé volta e o motorista reverte.
      await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
      await expect(notReturning).toBeVisible();
      await expect(badge).toHaveCount(0);
      await expectRosterCount(driverPage, 0, total);
    } finally {
      await driverContext.close();
    }
  });

  test('fora da janela: card consolidado sem Desfazer e CANCELLATION_PERIOD_EXPIRED na API', async ({
    page,
    request,
    epic4,
  }) => {
    test.setTimeout(120_000);
    const student = epic4.students[0];

    // Registro DENTRO da janela (via UI: o card nasce do cache da mutation —
    // é ele que persiste no MMKV e reidrata no reload).
    await loginAsStudent(page, student);
    await page.getByRole('button', { name: 'Não vou voltar' }).click();
    await page.getByRole('button', { name: 'Avisar motorista' }).click();
    await expect(page.getByText('Motorista avisado')).toBeVisible();
    const cancel = page.getByRole('button', { name: 'Desfazer', exact: true });
    await expect(cancel).toBeVisible();
    await expect(page.getByText(/Desfazer em \d{1,2}:\d{2}/)).toBeVisible();

    // Aging (única escrita direta no banco): desloca notifiedAt E cancellableUntil
    // 10 min para trás — o fim da janela (~2 min após o registro) fica então há
    // ~8 min no passado.
    await ageAbsence({ tripId: epic4.returnTripId, studentId: student.id }, 10);

    // O card vive no cache reidratado do MMKV e o
    // persister sincroniza com throttle de 1s — recarregar antes disso perde
    // a escrita junto com a página.
    await page.waitForTimeout(1500);
    // A UI exibe o countdown do `cancellableUntil` CACHED: envelhecer também o
    // cache do browser é o que leva o card ao estado consolidado sem esperar
    // os 2 min reais (ver ageAbsenceInClientCache).
    await ageAbsenceInClientCache(page, epic4.returnTripId, 10);
    await page.reload();
    await expect(page.getByText('Motorista avisado')).toBeVisible();
    // Consolidado: SEM botão Desfazer e SEM countdown.
    await expect(cancel).toHaveCount(0);
    await expect(page.getByText(/Desfazer em/)).toHaveCount(0);

    // API fora da janela: erro tipado com mensagem clara, sem 500.
    const response = await request.post(
      `${API_URL}/api/v1/boarding/cancel-absence`,
      {
        headers: {
          Authorization: `Bearer ${student.token}`,
          'X-Idempotency-Key': randomUUID(),
        },
        data: { tripId: epic4.returnTripId },
      },
    );
    expect(response.status()).toBe(409);
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error?.code).toBe('CANCELLATION_PERIOD_EXPIRED');
    expect(
      typeof body.error?.message === 'string' && body.error.message.length > 0,
    ).toBe(true);

    // A ausência persiste: novo reload mantém o card consolidado.
    await page.reload();
    await expect(page.getByText('Motorista avisado')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Não vou voltar' }),
    ).toHaveCount(0);
  });

  test('lembrete: scheduler real dispara, banner aparece no reload e respondê-lo registra a ausência', async ({
    page,
    request,
    browser,
    epic4,
  }) => {
    // Polling do scheduler real (tick de 60s), dois logins e a espera pelo
    // staleTime de 1 min do app (loop do banner) — o timeout do arquivo (60s)
    // não cobre; o de 15s do expect não chega perto.
    test.setTimeout(300_000);
    const student = epic4.students[0];
    const total = epic4.students.length;

    // Antes do aging o GET resolve null — assert intermediária: sem linha, sem
    // banner (o lembrete é derivado na leitura, não existe "agendado").
    const reminderRead = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/boarding/reminder') &&
        res.request().method() === 'GET',
    );
    await loginAsStudent(page, student);
    const firstRead = await reminderRead;
    expect(firstRead.status()).toBe(200);
    expect(((await firstRead.json()) as { data: unknown }).data).toBeNull();
    await expect(page.getByText('E a volta?')).toHaveCount(0);

    // Aging: RETURN iniciada há ~16 min (além da fronteira INCLUSIVA de 15 min)
    // com o aluno tendo check-in na ida e nada na volta — elegível no próximo
    // tick. O disparo é o scheduler real do dev server: a 4.4 proibiu backdoor
    // de trigger, então o spec ESPERA por ele.
    await ageTrip(epic4.returnTripId, 16);

    const reminderOf = async (): Promise<{
      tripId: string;
      remindedAt: string;
    } | null> => {
      const poll = await request.get(`${API_URL}/api/v1/boarding/reminder`, {
        headers: { Authorization: `Bearer ${student.token}` },
      });
      // Resposta não-200 (instabilidade do dev server em rebuild, por exemplo)
      // não deve abortar o teste: a amostra é descartada e o deadline decide.
      if (poll.status() !== 200) return null;
      return (
        (await poll.json()) as {
          data: {
            tripId: string;
            remindedAt: string;
          } | null;
        }
      ).data;
    };

    const deadline = Date.now() + REMINDER_POLL_TIMEOUT_MS;
    let reminder = await reminderOf();
    while (reminder === null && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, REMINDER_POLL_INTERVAL_MS),
      );
      reminder = await reminderOf();
    }
    if (reminder === null) {
      throw new Error(
        `GET /boarding/reminder seguiu null após ${REMINDER_POLL_TIMEOUT_MS}ms — o scheduler do dev server não disparou o lembrete (tick de 60s). Ver tests/README.md.`,
      );
    }
    expect(reminder.tripId).toBe(epic4.returnTripId);
    expect(Number.isNaN(Date.parse(reminder.remindedAt))).toBe(false);

    // O app não faz polling: o banner só aparece no remount — é o requisito
    // "derivável na abertura do app" para quem não estava no stream. Mas o
    // staleTime GLOBAL do app é de 1 minuto: remontar antes disso reidrata o
    // null persistido como fresco e não refaz o GET. Por isso o spec REMONTA
    // em loop até o banner aparecer — o refetch dispara no primeiro mount
    // depois do cache ficar velho.
    const notReturning = page.getByRole('button', { name: 'Não vou voltar' });
    await expect(async () => {
      await page.reload();
      await expect(page.getByText('E a volta?')).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 120_000, intervals: [1_000, 5_000] });
    // O banner não tem ação própria: o rodapé é a única entrada do aviso.
    await expect(notReturning).toHaveCount(1);
    await notReturning.click();
    await page.getByRole('button', { name: 'Avisar motorista' }).click();

    // Mesmo estado da 4.1, e o banner some com a pendência resolvida.
    await expect(page.getByText('Motorista avisado')).toBeVisible();
    await expect(page.getByText('E a volta?')).toHaveCount(0);

    // O motorista vê o badge: roster aberto depois reflete o servidor
    // (reconcile por refetch no mount), com o total excluindo o ausente.
    const driverContext = await browser.newContext({
      ...devices['Desktop Chrome'],
    });
    const driverPage = await driverContext.newPage();
    driverPage.setDefaultNavigationTimeout(120_000);
    try {
      await openDriverRoster(driverPage, epic4.driver, {
        boarded: 0,
        total: total - 1,
      });
      await expect(
        driverPage.getByText(NOT_RETURNING_BADGE, { exact: true }),
      ).toBeVisible();
    } finally {
      await driverContext.close();
    }
  });
});
