/**
 * Custom Playwright fixtures para PureUrban.
 *
 * `epic3`: semeia um cenário completo do Épico 3 (empresa + admin + motorista +
 * alunos + rota vinculada, motorista logado) via API antes do teste. Sem
 * cleanup — ver `seedEpic3Scenario` e as Design Notes da Story 3.6.
 *
 * `epic4`: cadeia completa do Épico 4 (OUTBOUND com check-in real → end →
 * RETURN ativa), alunos logináveis — ver `seedEpic4Scenario` (Story 4.5).
 *
 * `epic5`: cenário do Épico 5 SEM viagem (empresa + admin, motorista, rota com
 * vínculos, 1 aluno com credenciais) — ver `seedEpic5Scenario` (Story 5.3). O
 * caminho feliz inicia a viagem PELA UI; para viagem já ativa, chame o seed
 * diretamente com `opts.createActiveTrip`.
 *
 * Para opções customizadas de qualquer seed, chame o seed correspondente
 * diretamente no spec em vez de usar estas fixtures.
 */
import { test as base } from '@playwright/test';
import {
  seedEpic3Scenario,
  seedEpic4Scenario,
  seedEpic5Scenario,
  type Epic3Scenario,
  type Epic4Scenario,
  type Epic5Scenario,
} from './helpers/seed-helpers';

type PureUrbanFixtures = {
  epic3: Epic3Scenario;
  epic4: Epic4Scenario;
  epic5: Epic5Scenario;
};

export const test = base.extend<PureUrbanFixtures>({
  epic3: async ({ request }, use) => {
    const scenario = await seedEpic3Scenario(request);
    await use(scenario);
  },
  epic4: async ({ request }, use) => {
    const scenario = await seedEpic4Scenario(request);
    await use(scenario);
  },
  epic5: async ({ request }, use) => {
    const scenario = await seedEpic5Scenario(request);
    await use(scenario);
  },
});
