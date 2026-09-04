/**
 * NFR4 — a lista de alunos da viagem carrega em menos de 1s mesmo com 50+ alunos.
 *
 * API-only (sem browser): mede só a chamada de rede, que é o que a NFR governa.
 * A margem de ambiente local é documentada abaixo, como a Task 9.3 da 3.5a.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from '../support/merged-fixtures';
import { seedEpic3Scenario } from '../support/helpers/seed-helpers';
import { apiUnavailable } from '../support/helpers/e2e-servers';

const STUDENT_COUNT = 55;
// Teto da NFR4. Ambiente local (Postgres em Docker na mesma máquina, sem
// latência de rede) costuma ficar bem abaixo; a folga cobre uma máquina de CI
// carregada sem tornar a asserção decorativa.
const NFR4_BUDGET_MS = 1000;

test.describe('NFR4 — lista de alunos com 50+ alunos', () => {
  test.beforeAll(async () => {
    const reason = await apiUnavailable();
    test.skip(reason !== null, reason ?? '');
  });

  test('GET /trips/:id/students responde em menos de 1s', async ({ request }) => {
    // ~137 requisições sequenciais (55 alunos x2 + 27 check-ins + auth): o
    // default de 30s do Playwright não cobre.
    test.setTimeout(120_000);
    const scenario = await seedEpic3Scenario(request, {
      studentCount: STUDENT_COUNT,
    });

    const tripRes = await request.post('/api/v1/trips', {
      data: { routeId: scenario.routeId, type: 'OUTBOUND' },
      headers: { Authorization: `Bearer ${scenario.driverToken}` },
    });
    expect(tripRes.ok()).toBeTruthy();
    const tripId = ((await tripRes.json()) as { data: { id: string } }).data.id;

    // Metade da turma embarca — o endpoint agrega status por aluno.
    const half = Math.floor(STUDENT_COUNT / 2);
    for (const studentId of scenario.studentIds.slice(0, half)) {
      const res = await request.post('/api/v1/boarding/check-in', {
        data: { studentId, tripId },
        headers: {
          Authorization: `Bearer ${scenario.driverToken}`,
          'X-Idempotency-Key': randomUUID(),
        },
      });
      expect(res.status(), await res.text()).toBe(201);
    }

    const start = Date.now();
    const listRes = await request.get(`/api/v1/trips/${tripId}/students`, {
      headers: { Authorization: `Bearer ${scenario.driverToken}` },
    });
    const elapsedMs = Date.now() - start;

    expect(listRes.ok()).toBeTruthy();
    const body = (await listRes.json()) as {
      data: {
        students: { status: string }[];
        summary: { boarded: number; total: number };
      };
    };
    expect(body.data.students).toHaveLength(STUDENT_COUNT);
    expect(body.data.summary).toEqual({
      boarded: half,
      total: STUDENT_COUNT,
    });

    // eslint-disable-next-line no-console
    console.log(`[NFR4] GET /trips/:id/students → ${elapsedMs}ms (budget ${NFR4_BUDGET_MS}ms, ${STUDENT_COUNT} alunos)`);
    expect(elapsedMs).toBeLessThan(NFR4_BUDGET_MS);
  });
});
