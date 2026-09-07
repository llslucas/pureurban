/**
 * Seed helpers — setup de dados do Épico 3 via API (nunca via UI, nunca via
 * seed do banco: cada spec precisa de um tenant isolado com e-mail único, e o
 * seed é global e idempotente por nome de empresa).
 *
 * Cada chamada cria um tenant isolado a partir de `POST /auth/register` com
 * e-mail faker único. Não há cleanup: lixo no Postgres de teste local é aceito,
 * como já em `test/*.e2e-spec.ts` (ver Design Notes da Story 3.6).
 */
import { APIRequestContext } from '@playwright/test';
import { createPersonInput } from '../factories/student.factory';
import { createRouteInput } from '../factories/route.factory';

const API = '/api/v1';

type Json = Record<string, unknown>;

async function postJson(
  request: APIRequestContext,
  path: string,
  data: Json,
  token?: string,
): Promise<Json> {
  const response = await request.post(`${API}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok()) {
    throw new Error(
      `POST ${path} → ${response.status()}: ${await response.text()}`,
    );
  }
  const raw: unknown = await response.json();
  if (typeof raw !== 'object' || raw === null || !('data' in raw)) {
    throw new Error(
      `POST ${path}: resposta sem envelope { data } — recebido: ${JSON.stringify(raw)}`,
    );
  }
  const body = (raw as { data: unknown }).data;
  if (typeof body !== 'object' || body === null) {
    throw new Error(
      `POST ${path}: \`data\` não é um objeto — recebido: ${JSON.stringify(raw)}`,
    );
  }
  return body as Json;
}

/** Lê uma string obrigatória de um corpo de resposta, com erro legível. */
function str(source: Json, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `${where}: campo \`${key}\` ausente ou não-string — recebido: ${JSON.stringify(source)}`,
    );
  }
  return value;
}

/** Lê um objeto aninhado obrigatório, com erro legível. */
function obj(source: Json, key: string, where: string): Json {
  const value = source[key];
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `${where}: campo \`${key}\` ausente ou não-objeto — recebido: ${JSON.stringify(source)}`,
    );
  }
  return value as Json;
}

export interface Epic3Credentials {
  email: string;
  password: string;
}

export interface Epic3Scenario {
  adminToken: string;
  driverToken: string;
  driver: Epic3Credentials;
  routeId: string;
  /** Alunos vinculados à rota, na ordem de criação. */
  studentIds: string[];
  companyId: string;
}

export interface SeedEpic3Options {
  /**
   * Quantos alunos criar e vincular à rota. Default 3; passe 50+ para o cenário
   * de NFR4. Valores <= 0 ou não-inteiros caem no default.
   */
  studentCount?: number;
}

const DEFAULT_STUDENT_COUNT = 3;

/**
 * Empresa + admin + motorista + N alunos + rota, tudo vinculado, com o motorista
 * já logado. Suficiente para `POST /trips` seguido de check-ins.
 */
export async function seedEpic3Scenario(
  request: APIRequestContext,
  opts: SeedEpic3Options = {},
): Promise<Epic3Scenario> {
  const requested = opts.studentCount;
  const studentCount =
    typeof requested === 'number' &&
    Number.isInteger(requested) &&
    requested > 0
      ? requested
      : DEFAULT_STUDENT_COUNT;

  const adminInput = createPersonInput();
  const register = await postJson(request, '/auth/register', {
    name: adminInput.name,
    email: adminInput.email,
    password: adminInput.password,
  });
  const adminToken = str(register, 'accessToken', 'POST /auth/register');
  const companyId = str(
    obj(register, 'company', 'POST /auth/register'),
    'id',
    'POST /auth/register → company',
  );

  const driverInput = createPersonInput();
  await postJson(request, '/drivers', { ...driverInput }, adminToken);

  const driverLogin = await postJson(request, '/auth/login', {
    email: driverInput.email,
    password: driverInput.password,
  });
  const driverToken = str(driverLogin, 'accessToken', 'POST /auth/login');
  const driverId = str(
    obj(driverLogin, 'user', 'POST /auth/login'),
    'id',
    'POST /auth/login → user',
  );

  const route = await postJson(
    request,
    '/routes',
    { ...createRouteInput() },
    adminToken,
  );
  const routeId = str(route, 'id', 'POST /routes');

  await postJson(
    request,
    `/routes/${routeId}/drivers`,
    { driverId },
    adminToken,
  );

  const studentIds: string[] = [];
  for (let i = 0; i < studentCount; i++) {
    const student = await postJson(
      request,
      '/students',
      { ...createPersonInput() },
      adminToken,
    );
    const studentId = str(student, 'id', 'POST /students');
    await postJson(
      request,
      `/routes/${routeId}/students`,
      { studentId },
      adminToken,
    );
    studentIds.push(studentId);
  }

  return {
    adminToken,
    driverToken,
    driver: { email: driverInput.email, password: driverInput.password },
    routeId,
    studentIds,
    companyId,
  };
}
