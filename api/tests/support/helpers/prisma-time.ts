/**
 * Aging de timestamps para os specs E2E do Épico 4 (Story 4.5).
 *
 * As janelas de 2 min (cancelamento) e 15 min (lembrete) são inviáveis em
 * tempo real, e os endpoints NÃO aceitam datas no passado — a única forma de
 * alcançar "fora da janela" / "elegível ao lembrete" é escrever o timestamp
 * direto no banco (precedente do supertest `boarding.e2e-spec.ts`, que semeia
 * `BoardingAbsence` com datas passadas). Este módulo é o ÚNICO ponto de escrita
 * direta da suíte Playwright: centralizado aqui para ser auditable — a criação
 * de dados continua 100% via API (`seed-helpers.ts`).
 *
 * Cliente Prisma com adapter `PrismaPg` + dotenv, mesmo padrão do
 * `prisma/seed.ts` (Story 1.9): roda no processo do Playwright (cwd `api/`),
 * não no dev server. Conexão por chamada com `$disconnect` — o aging acontece
 * poucas vezes por teste e um pool vivo penduraria o fim do worker.
 */
import 'dotenv/config';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

function client(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'prisma-time: DATABASE_URL não definida — copie api/.env.example para api/.env',
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

const MINUTES_TO_MS = 60_000;

/**
 * Move `Trip.startedAt` para `toMinutesAgo` minutos atrás de AGORA (alvo
 * absoluto: `startedAt = now - toMinutesAgo`). É o que torna a RETURN elegível
 * ao scan de lembretes (15 min) sem esperar tempo real.
 */
export async function ageTrip(
  tripId: string,
  toMinutesAgo: number,
): Promise<void> {
  const prisma = client();
  try {
    const startedAt = new Date(Date.now() - toMinutesAgo * MINUTES_TO_MS);
    const updated = await prisma.trip.updateMany({
      where: { id: tripId },
      data: { startedAt },
    });
    if (updated.count === 0) {
      throw new Error(`prisma-time.ageTrip: viagem ${tripId} não encontrada`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Desloca `notifiedAt` e `cancellableUntil` da ausência `deltaMinutes` minutos
 * PARA TRÁS dos valores já gravados (delta relativo, não alvo absoluto —
 * preserva a invariante `cancellableUntil = notifiedAt + 2 min`). A ausência é
 * localizada por id ou por (tripId, studentId).
 */
export async function ageAbsence(
  locate: { id: string } | { tripId: string; studentId: string },
  deltaMinutes: number,
): Promise<void> {
  const prisma = client();
  try {
    const absence = await prisma.boardingAbsence.findFirst({
      where: { ...locate, cancelledAt: null },
    });
    if (!absence) {
      throw new Error(
        `prisma-time.ageAbsence: ausência ativa não encontrada para ${JSON.stringify(locate)}`,
      );
    }
    const deltaMs = deltaMinutes * MINUTES_TO_MS;
    await prisma.boardingAbsence.update({
      where: { id: absence.id },
      data: {
        notifiedAt: new Date(absence.notifiedAt.getTime() - deltaMs),
        cancellableUntil: new Date(
          absence.cancellableUntil.getTime() - deltaMs,
        ),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
