/**
 * Seed helpers — setup de dados do Épico 3 via API (nunca via UI, nunca via
 * seed do banco: cada spec precisa de um tenant isolado com e-mail único, e o
 * seed é global e idempotente por nome de empresa).
 *
 * Cada chamada cria um tenant isolado a partir de `POST /auth/register` com
 * e-mail faker único. Não há cleanup: lixo no Postgres de teste local é aceito,
 * como já em `test/*.e2e-spec.ts` (ver Design Notes da Story 3.6).
 */
import { randomUUID } from 'node:crypto';
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
  headers: Record<string, string> = {},
): Promise<Json> {
  const response = await request.post(`${API}${path}`, {
    data,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
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

async function patchJson(
  request: APIRequestContext,
  path: string,
  data: Json,
  token?: string,
): Promise<Json> {
  const response = await request.patch(`${API}${path}`, {
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok()) {
    throw new Error(
      `PATCH ${path} → ${response.status()}: ${await response.text()}`,
    );
  }
  const raw: unknown = await response.json();
  if (typeof raw !== 'object' || raw === null || !('data' in raw)) {
    throw new Error(
      `PATCH ${path}: resposta sem envelope { data } — recebido: ${JSON.stringify(raw)}`,
    );
  }
  return (raw as { data: Json }).data;
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

export interface Epic4Student {
  id: string;
  name: string;
  email: string;
  password: string;
  /** Token de acesso do aluno (STUDENT) — polling do GET /reminder, cancel via API. */
  token: string;
}

export interface Epic4Scenario {
  adminToken: string;
  driverToken: string;
  driver: Epic3Credentials;
  routeId: string;
  companyId: string;
  outboundTripId: string;
  /** RETURN ativa com relatedTripId → é ela que `GET /trips/active` resolve. */
  returnTripId: string;
  /** Alunos vinculados à rota, na ordem de criação, logináveis. */
  students: Epic4Student[];
}

export interface SeedEpic4Options {
  studentCount?: number;
  /**
   * Quantos alunos fazem check-in REAL na OUTBOUND (ordem de criação) — é o
   * que o scan de lembretes cruza com a RETURN. Default 1; clampado a
   * [0, studentCount].
   */
  outboundCheckIns?: number;
}

const EPIC4_DEFAULT_STUDENT_COUNT = 3;
const EPIC4_DEFAULT_OUTBOUND_CHECK_INS = 1;

/**
 * Cenário do Épico 4 (Story 4.5): empresa + admin, motorista, rota, N alunos
 * COM credenciais, vínculos, OUTBOUND com check-ins reais (header
 * `X-Idempotency-Key`), end da OUTBOUND e RETURN ativa com `relatedTripId` —
 * a cadeia completa via API, sem cleanup (padrão 3.6).
 *
 * A RETURN é a única viagem ativa: é ela que o home do aluno e a lista do
 * motorista resolvem (`get-active-student-trip` só devolve RETURN ativa).
 */
export async function seedEpic4Scenario(
  request: APIRequestContext,
  opts: SeedEpic4Options = {},
): Promise<Epic4Scenario> {
  const requested = opts.studentCount;
  const studentCount =
    typeof requested === 'number' &&
    Number.isInteger(requested) &&
    requested > 0
      ? requested
      : EPIC4_DEFAULT_STUDENT_COUNT;
  const requestedCheckIns = opts.outboundCheckIns;
  const outboundCheckIns = Math.max(
    0,
    Math.min(
      typeof requestedCheckIns === 'number' &&
        Number.isInteger(requestedCheckIns) &&
        // `>= 0` e não `> 0`: 0 é um cenário legítimo (nenhum check-in na ida —
        // ninguém elegível ao lembrete) e não pode virar o default 1.
        requestedCheckIns >= 0
        ? requestedCheckIns
        : EPIC4_DEFAULT_OUTBOUND_CHECK_INS,
      studentCount,
    ),
  );

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

  const students: Epic4Student[] = [];
  for (let i = 0; i < studentCount; i++) {
    const input = createPersonInput();
    const student = await postJson(
      request,
      '/students',
      { ...input },
      adminToken,
    );
    const studentId = str(student, 'id', 'POST /students');
    await postJson(
      request,
      `/routes/${routeId}/students`,
      { studentId },
      adminToken,
    );
    const login = await postJson(request, '/auth/login', {
      email: input.email,
      password: input.password,
    });
    students.push({
      id: studentId,
      name: input.name,
      email: input.email,
      password: input.password,
      token: str(login, 'accessToken', 'POST /auth/login (aluno)'),
    });
  }

  const outbound = await postJson(
    request,
    '/trips',
    { routeId, type: 'OUTBOUND' },
    driverToken,
  );
  const outboundTripId = str(outbound, 'id', 'POST /trips (OUTBOUND)');

  for (let i = 0; i < outboundCheckIns; i++) {
    await postJson(
      request,
      '/boarding/check-in',
      { studentId: students[i].id, tripId: outboundTripId },
      driverToken,
      // Check-in EXIGE idempotência (fila offline Tier 2) — key única por aluno.
      { 'X-Idempotency-Key': randomUUID() },
    );
  }

  // End da OUTBOUND: o motorista só tem uma viagem ativa por vez, e a home do
  // aluno só resolve RETURN ativa — sem o end, o POST da RETURN falha.
  await patchJson(request, `/trips/${outboundTripId}/end`, {}, driverToken);

  const returnTrip = await postJson(
    request,
    '/trips',
    { routeId, type: 'RETURN', relatedTripId: outboundTripId },
    driverToken,
  );
  const returnTripId = str(returnTrip, 'id', 'POST /trips (RETURN)');

  return {
    adminToken,
    driverToken,
    driver: { email: driverInput.email, password: driverInput.password },
    routeId,
    companyId,
    outboundTripId,
    returnTripId,
    students,
  };
}

export interface Epic5Student {
  id: string;
  name: string;
  email: string;
  password: string;
  /** Token de acesso do aluno (STUDENT) — abrir o stream de acompanhamento. */
  token: string;
}

export interface Epic5Scenario {
  adminToken: string;
  driverToken: string;
  driver: Epic3Credentials;
  routeId: string;
  companyId: string;
  /** `null` quando o teste inicia a viagem PELA UI (caminho feliz da 5.3). */
  tripId: string | null;
  student: Epic5Student;
}

export interface SeedEpic5Options {
  /**
   * Cria OUTBOUND ACTIVE via `POST /trips` (testes degradado e de fim, cuja
   * viagem não passa pela UI de "Iniciar Viagem"). Default false.
   */
  createActiveTrip?: boolean;
}

/**
 * Cenário do Épico 5 (Story 5.3): empresa + admin, motorista, rota com vínculos
 * (driver + aluno) e 1 aluno COM credenciais — SEM check-ins e, por default,
 * SEM viagem: o caminho feliz inicia pela UI, então o seed entrega só o
 * cenário pronto. Testes que precisam de viagem já ativa passam
 * `opts.createActiveTrip`. 100% via API, sem cleanup (padrão 3.6/4.5).
 */
export async function seedEpic5Scenario(
  request: APIRequestContext,
  opts: SeedEpic5Options = {},
): Promise<Epic5Scenario> {
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

  const studentInput = createPersonInput();
  const student = await postJson(
    request,
    '/students',
    { ...studentInput },
    adminToken,
  );
  const studentId = str(student, 'id', 'POST /students');
  await postJson(
    request,
    `/routes/${routeId}/students`,
    { studentId },
    adminToken,
  );
  const studentLogin = await postJson(request, '/auth/login', {
    email: studentInput.email,
    password: studentInput.password,
  });

  let tripId: string | null = null;
  if (opts.createActiveTrip) {
    const trip = await postJson(
      request,
      '/trips',
      { routeId, type: 'OUTBOUND' },
      driverToken,
    );
    tripId = str(trip, 'id', 'POST /trips (OUTBOUND)');
  }

  return {
    adminToken,
    driverToken,
    driver: { email: driverInput.email, password: driverInput.password },
    routeId,
    companyId,
    tripId,
    student: {
      id: studentId,
      name: studentInput.name,
      email: studentInput.email,
      password: studentInput.password,
      token: str(studentLogin, 'accessToken', 'POST /auth/login (aluno)'),
    },
  };
}
