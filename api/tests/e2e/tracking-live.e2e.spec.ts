/**
 * Épico 5 — localização em tempo real, ponta a ponta pela UI contra a API real
 * (sem MSW e sem mock de tracking: o que se prova é o pipeline real
 * REST → Redis Pub/Sub → SSE → render).
 *
 * Geolocation mockada pelo Playwright em AMBOS os contextos
 * (`permissions: ['geolocation']` + coordenadas fixas): no alvo web o
 * expo-location delega a `navigator.geolocation`
 * (`node_modules/expo-location/build/ExpoLocation.web.js`), então
 * `context.setGeolocation` dirige a captura do motorista e a posição do aluno —
 * zero mudança de código de produção. ARMADILHA do Chromium: o expo-location
 * web chama getCurrentPosition com `maximumAge: Infinity`, então o browser
 * serve a PRIMEIRA fix em cache para sempre — `setGeolocation` sozinho NUNCA
 * muda o que o motorista captura. Mover o motorista é
 * `setGeolocation(B)` + `reload()` na página dele: o cache de posição é por
 * documento, e o app reidrata o login (MMKV) e retoma a captura sozinho.
 *
 * O degradado de 15s é esperado EM TEMPO REAL: o timer é `setTimeout` no
 * browser (`track-bus.tsx`), não há relógio de banco a envelhecer —
 * `prisma-time` (Épico 4) não se aplica aqui.
 */
import { devices } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../support/merged-fixtures';
import { e2eServersUnavailable } from '../support/helpers/e2e-servers';
import { loginAsDriver, loginAsStudent } from '../support/helpers/e2e-driver';
import {
  seedEpic5Scenario,
  type Epic3Credentials,
} from '../support/helpers/seed-helpers';

// NFR2 fala da ENTREGA (Redis Pub/Sub → SSE → render): t0 é a RESPOSTA do POST
// do motorista que já carrega o ponto novo; a latência de captura (tick ≤5s do
// produtor) fica FORA da conta. A prova de entrega pura <5s já vive no
// supertest (test/tracking.e2e-spec.ts).
const NFR2_BUDGET_MS = 5000;

// Espera real do degradado: 15s de timer no browser + margem para o último
// tick do produtor e o render. Pings do stream NÃO contam como sinal — o chip
// aparecer com a conexão SSE viva é a prova disso.
const GPS_STALE_VISIBLE_MS = 25_000;

// Prova da parada da captura pós-fim: janela > 1 tick completo de 5s.
const CAPTURE_STOP_WINDOW_MS = 7_000;

// Coordenadas fixas (região de Viçosa/MG) escolhidas para distâncias/ETAs
// computáveis: aluno parado em S; motorista em A (~222 m do aluno) e movido
// para B (~55,6 km). Os textos esperados são computados com as MESMAS funções
// de mobile/src/lib/geo.ts (réplicas abaixo) — asserts exatos, não regex.
const STUDENT_POINT: FixedPoint = {
  latitude: -20.755549,
  longitude: -42.881728,
};
const DRIVER_POINT_A: FixedPoint = {
  latitude: -20.753549,
  longitude: -42.881728,
};
const DRIVER_POINT_B: FixedPoint = {
  latitude: -21.255549,
  longitude: -42.881728,
};
const GPS_ACCURACY_M = 10;

interface FixedPoint {
  latitude: number;
  longitude: number;
}

// ---- Réplicas dos algoritmos de mobile/src/lib/geo.ts ------------------

const EARTH_RADIUS_M = 6_371_000;
const AVERAGE_BUS_SPEED_KMH = 25;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

function haversineDistanceMeters(a: FixedPoint, b: FixedPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(meters: number): string {
  const rounded = Math.round(meters);
  if (rounded < 1_000) {
    return `${rounded} m`;
  }
  return `${(rounded / 1_000).toFixed(1).replace('.', ',')} km`;
}

function formatEta(distanceMeters: number): string {
  if (distanceMeters < 100) {
    return 'Chegando';
  }
  const minutes = Math.max(
    1,
    Math.round(distanceMeters / ((AVERAGE_BUS_SPEED_KMH * 1_000) / 60)),
  );
  return `~${minutes} min`;
}

const coordsTextOf = (point: FixedPoint): string =>
  `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;

/** Textos exatos que a tela do aluno exibe com o ônibus em `point`. */
function expectedTexts(point: FixedPoint) {
  const meters = haversineDistanceMeters(STUDENT_POINT, point);
  return {
    coords: coordsTextOf(point),
    distance: formatDistance(meters),
    eta: `${formatEta(meters)} — tempo estimado até você`,
  };
}

// ---- Helpers de página --------------------------------------------------

// Contexto do motorista sem herdar as opções do projeto (newContext cru):
// replica o device do projeto e adiciona a geolocation mockada.
function newDriverContext(
  browser: Browser,
  point: FixedPoint,
): Promise<BrowserContext> {
  return browser.newContext({
    ...devices['Desktop Chrome'],
    permissions: ['geolocation'],
    geolocation: {
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: GPS_ACCURACY_M,
    },
  });
}

// Aluno: permissão e ponto fixo entram ANTES do primeiro goto — grantPermissions
// e setGeolocation valem para as páginas do contexto, inclusive as novas.
async function openStudentTracking(
  page: Page,
  student: Epic3Credentials,
): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({
    latitude: STUDENT_POINT.latitude,
    longitude: STUDENT_POINT.longitude,
    accuracy: GPS_ACCURACY_M,
  });
  await loginAsStudent(page, student);
  await page.getByRole('button', { name: 'Onde está o ônibus' }).click();
}

// A tela do aluno só mostra distância/ETA com a posição do PRÓPRIO aluno em
// mãos (watchPosition com a geolocation mockada) — por isso os quatro textos.
async function expectStudentSees(page: Page, point: FixedPoint): Promise<void> {
  const texts = expectedTexts(point);
  await expect(realtimeChip(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(texts.coords)).toBeVisible();
  await expect(page.getByText(texts.distance)).toBeVisible();
  await expect(page.getByText(texts.eta)).toBeVisible();
}

// Os chips são mutualmente exclusivos no render, MAS o Banner "Dados podem
// estar desatualizados — sem atualização em tempo real" fica montado (oculto
// por altura 0) e getText SEM exact colide com o seu trecho "em tempo real".
function realtimeChip(page: Page): ReturnType<Page['getByText']> {
  return page.getByText('Em tempo real', { exact: true });
}

function staleChip(page: Page): ReturnType<Page['getByText']> {
  return page.getByText('Sem sinal GPS', { exact: true });
}

/** Instantes (Date.now) dos POSTs /tracking/location iniciados na página e dos
 * que completaram com ack do servidor (<400) — offline a cadência continua por
 * design (falha de envio descarta a posição), o que cessa é o ack. */
function trackLocationPosts(page: Page): {
  startedAt: number[];
  succeededAt: number[];
} {
  const log: { startedAt: number[]; succeededAt: number[] } = {
    startedAt: [],
    succeededAt: [],
  };
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/api/v1/tracking/location')
    ) {
      log.startedAt.push(Date.now());
    }
  });
  page.on('response', (response) => {
    if (
      response.request().method() === 'POST' &&
      response.url().includes('/api/v1/tracking/location') &&
      response.status() < 400
    ) {
      log.succeededAt.push(Date.now());
    }
  });
  return log;
}

function collectConsoleTexts(page: Page): string[] {
  const texts: string[] = [];
  page.on('console', (message) => texts.push(message.text()));
  return texts;
}

// Toda chamada /api/v1 tem de bater na API real: o banner do MSW no console é
// a prova observável de que os mocks subiram (EXPO_PUBLIC_USE_MOCKS=0 os
// desliga) — o spec falha se ele aparecer.
function expectNoMocksInConsole(texts: string[]): void {
  expect(texts.some((text) => text.includes('[mocks] MSW ativo'))).toBe(false);
}

test.describe('Épico 5 — acompanhamento do ônibus em tempo real', () => {
  // Os specs do projeto `e2e` dividem um único Expo dev server e rodam seriais
  // (playwright.config.ts: fullyParallel:false + --workers=1). O retry cobre
  // uma revalidação lenta do Metro sob carga — ambiente, não regressão.
  test.describe.configure({ retries: process.env.CI ? 2 : 1 });

  test.beforeAll(async () => {
    const reason = await e2eServersUnavailable();
    test.skip(reason !== null, reason ?? '');
  });

  test('feliz: iniciar viagem pela UI, GPS a cada ~5s e o texto do aluno atualiza em <5s (NFR2)', async ({
    page,
    browser,
    epic5,
  }) => {
    test.setTimeout(180_000);
    const driverContext = await newDriverContext(browser, DRIVER_POINT_A);
    const driverPage = await driverContext.newPage();
    driverPage.setDefaultNavigationTimeout(120_000);
    const driverConsole = collectConsoleTexts(driverPage);
    const studentConsole = collectConsoleTexts(page);
    try {
      const posts = trackLocationPosts(driverPage);
      await loginAsDriver(driverPage, epic5.driver);
      // O clique pode "estourar" o timeout de actionability quando o próprio
      // onPress desmonta o botão (mutation → cache ACTIVE → re-render): o
      // disparo vale pelo estado seguinte, não pela promessa do clique.
      try {
        await driverPage
          .getByRole('button', { name: 'Iniciar Viagem' })
          .click({ timeout: 10_000 });
      } catch {
        // Viagem possivelmente já iniciada pelo disparo acima.
      }
      // Estado ativo: o gate da captura reage ao cache (viagem ACTIVE) e o
      // primeiro POST dispara sozinho — captura invisível, sem toque algum.
      await expect(
        driverPage.getByRole('button', { name: 'Encerrar Viagem' }),
      ).toBeVisible({ timeout: 20_000 });

      // Cadência do gps-capture (tick-a-tick de 5s): 3 POSTs com gaps de 3-8s.
      await expect
        .poll(() => posts.startedAt.length, {
          timeout: 20_000,
          intervals: [1_000],
        })
        .toBeGreaterThanOrEqual(3);
      for (let i = 1; i < posts.startedAt.length; i++) {
        const gap = posts.startedAt[i] - posts.startedAt[i - 1];
        expect(gap).toBeGreaterThanOrEqual(3_000);
        expect(gap).toBeLessThanOrEqual(8_000);
      }

      // Aluno descobre a viagem (GET /tracking/trips/active) e vê A.
      await openStudentTracking(page, epic5.student);
      await expectStudentSees(page, DRIVER_POINT_A);

      // Movimento A→B: setGeolocation troca o mock, mas o cache de posição do
      // Chromium (maximumAge: Infinity no expo-location web) só expira com o
      // documento — o reload retoma o app logado e a captura já em B. O t0 do
      // NFR2 é a RESPOSTA do POST que JÁ carrega B (o predicado confere a
      // latitude no body) — entrega pura, sem latência de captura na conta.
      const postOfB = driverPage.waitForResponse(
        (response) => {
          if (response.request().method() !== 'POST') return false;
          if (!response.url().includes('/api/v1/tracking/location')) {
            return false;
          }
          const body = response.request().postDataJSON() as {
            latitude?: number;
          } | null;
          return body?.latitude === DRIVER_POINT_B.latitude;
        },
        { timeout: 30_000 },
      );
      await driverContext.setGeolocation({
        latitude: DRIVER_POINT_B.latitude,
        longitude: DRIVER_POINT_B.longitude,
        accuracy: GPS_ACCURACY_M,
      });
      await driverPage.reload();
      const bPost = await postOfB;
      expect(bPost.status()).toBe(200);

      const t0 = Date.now();
      const bTexts = expectedTexts(DRIVER_POINT_B);
      await expect(page.getByText(bTexts.distance)).toBeVisible({
        timeout: NFR2_BUDGET_MS,
      });
      const nfr2Ms = Date.now() - t0;
      console.log(
        `[NFR2] POST do motorista → texto de distância/ETA do aluno: ${nfr2Ms}ms (budget ${NFR2_BUDGET_MS}ms)`,
      );
      expect(nfr2Ms).toBeLessThan(NFR2_BUDGET_MS);

      // Substituição (last-write-wins na tela): coordenadas e textos de A saem.
      const aTexts = expectedTexts(DRIVER_POINT_A);
      await expect(page.getByText(bTexts.coords)).toBeVisible();
      await expect(page.getByText(bTexts.eta)).toBeVisible();
      await expect(page.getByText(aTexts.coords)).toHaveCount(0);
      await expect(page.getByText(aTexts.distance)).toHaveCount(0);

      expectNoMocksInConsole(driverConsole);
      expectNoMocksInConsole(studentConsole);
    } finally {
      await driverContext.close();
    }
  });

  test('degradado e recuperação: offline → "Sem sinal GPS" com último ponto; online → "Em tempo real" reatualizado', async ({
    request,
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    // OUTBOUND ACTIVE semeada via API: o motorista nem passa pela UI de iniciar
    // — a captura liga sozinha quando a tela resolve a viagem ativa no cache.
    const scenario = await seedEpic5Scenario(request, {
      createActiveTrip: true,
    });
    const driverContext = await newDriverContext(browser, DRIVER_POINT_A);
    const driverPage = await driverContext.newPage();
    driverPage.setDefaultNavigationTimeout(120_000);
    const driverConsole = collectConsoleTexts(driverPage);
    const studentConsole = collectConsoleTexts(page);
    const posts = trackLocationPosts(driverPage);
    try {
      await loginAsDriver(driverPage, scenario.driver);
      await expect(
        driverPage.getByRole('button', { name: 'Encerrar Viagem' }),
      ).toBeVisible({ timeout: 20_000 });

      await openStudentTracking(page, scenario.student);
      await expectStudentSees(page, DRIVER_POINT_A);

      // Motorista sai do ar: POSTs cessam, mas o stream do aluno segue vivo
      // (com pings) — o chip só pode vir do timer de 15s sem location.updated.
      const offlineAt = Date.now();
      await driverContext.setOffline(true);
      await expect(staleChip(page)).toBeVisible({
        timeout: GPS_STALE_VISIBLE_MS,
      });
      // Último ponto mantido: nem coordenadas nem distância/ETA mudam — e o
      // chip "Em tempo real" (exato: o banner oculto contém "em tempo real")
      // realmente saiu do render.
      const aTexts = expectedTexts(DRIVER_POINT_A);
      await expect(page.getByText(aTexts.coords)).toBeVisible();
      await expect(page.getByText(aTexts.distance)).toBeVisible();
      await expect(page.getByText(aTexts.eta)).toBeVisible();
      await expect(realtimeChip(page)).toHaveCount(0);

      // Primeira cláusula da matriz "Degradado", direta: a TRANSMISSÃO cessa —
      // nenhum POST recebe ack do servidor na janela offline (mesmo padrão do
      // 0-POSTs do teste de fim). A recuperação/reload abaixo ackam de novo —
      // fora desta janela.
      expect(
        posts.succeededAt.filter((succeededAt) => succeededAt > offlineAt),
      ).toEqual([]);

      // Recuperação: o motorista volta online — o próximo tick (posição em
      // cache A) já reengaja o sinal — e o reload troca a captura para B,
      // provando que o texto REATUALIZA (e não apenas o chip).
      await driverContext.setOffline(false);
      await expect(realtimeChip(page)).toBeVisible({ timeout: 20_000 });
      await driverContext.setGeolocation({
        latitude: DRIVER_POINT_B.latitude,
        longitude: DRIVER_POINT_B.longitude,
        accuracy: GPS_ACCURACY_M,
      });
      await driverPage.reload();
      const bTexts = expectedTexts(DRIVER_POINT_B);
      await expect(page.getByText(bTexts.distance)).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(bTexts.eta)).toBeVisible();
      await expect(staleChip(page)).toHaveCount(0);
      await expect(realtimeChip(page)).toBeVisible();
      await expect(page.getByText(aTexts.distance)).toHaveCount(0);

      expectNoMocksInConsole(driverConsole);
      expectNoMocksInConsole(studentConsole);
    } finally {
      await driverContext.close();
    }
  });

  test('fim pela UI: aluno cai no "Nenhuma viagem ativa", motorista volta ao estado inicial e 0 POSTs em 7s', async ({
    request,
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const scenario = await seedEpic5Scenario(request, {
      createActiveTrip: true,
    });
    const driverContext = await newDriverContext(browser, DRIVER_POINT_A);
    const driverPage = await driverContext.newPage();
    driverPage.setDefaultNavigationTimeout(120_000);
    const driverConsole = collectConsoleTexts(driverPage);
    const studentConsole = collectConsoleTexts(page);
    try {
      const posts = trackLocationPosts(driverPage);
      await loginAsDriver(driverPage, scenario.driver);
      await expect(
        driverPage.getByRole('button', { name: 'Encerrar Viagem' }),
      ).toBeVisible({ timeout: 20_000 });

      await openStudentTracking(page, scenario.student);
      await expectStudentSees(page, DRIVER_POINT_A);

      const endResponse = driverPage.waitForResponse(
        (response) =>
          response.request().method() === 'PATCH' &&
          response.url().includes('/api/v1/trips/') &&
          response.url().endsWith('/end'),
        { timeout: 15_000 },
      );
      // Ending asks for confirmation (D-UX-7, story 6.5): the PATCH comes from
      // the dialog's "Encerrar", not from the bar button.
      await driverPage.getByRole('button', { name: 'Encerrar Viagem' }).click();
      await driverPage.getByTestId('end-trip-dialog-confirm').click();
      const end = await endResponse;
      expect(end.status()).toBe(200);
      const tripEndedAt = Date.now();

      // Sentinela trip.ended → reconexão toma 409 → stream fecha elegantemente
      // e a descoberta volta a consultar (invalidation no onTripEnded).
      await expect(
        page.getByText('Nenhuma viagem ativa no momento'),
      ).toBeVisible({ timeout: 20_000 });

      // Motorista de volta ao estado de partida: para uma OUTBOUND concluída,
      // o botão de partida é o da próxima perna ("Iniciar Retorno", branch
      // isReturn em trip.tsx) — o estado de viagem ativa acabou.
      await expect(
        driverPage.getByText('Concluída', { exact: true }),
      ).toBeVisible();
      await expect(
        driverPage.getByRole('button', { name: 'Iniciar Retorno' }),
      ).toBeVisible();
      await expect(
        driverPage.getByRole('button', { name: 'Encerrar Viagem' }),
      ).toHaveCount(0);

      // Prova da parada da captura: a captura é amarrada ao ciclo da viagem —
      // nenhum POST pode iniciar numa janela maior que um tick (5s).
      await page.waitForTimeout(CAPTURE_STOP_WINDOW_MS);
      expect(
        posts.startedAt.filter((startedAt) => startedAt > tripEndedAt),
      ).toEqual([]);

      expectNoMocksInConsole(driverConsole);
      expectNoMocksInConsole(studentConsole);
    } finally {
      await driverContext.close();
    }
  });
});
