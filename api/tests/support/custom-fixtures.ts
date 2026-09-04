/**
 * Custom Playwright fixtures para PureUrban.
 *
 * `epic3`: semeia um cenário completo do Épico 3 (empresa + admin + motorista +
 * alunos + rota vinculada, motorista logado) via API antes do teste. Sem
 * cleanup — ver `seedEpic3Scenario` e as Design Notes da Story 3.6.
 *
 * Para um número customizado de alunos (NFR4), chame `seedEpic3Scenario`
 * diretamente no spec em vez de usar esta fixture.
 */
import { test as base } from '@playwright/test';
import {
  seedEpic3Scenario,
  type Epic3Scenario,
} from './helpers/seed-helpers';

type PureUrbanFixtures = {
  epic3: Epic3Scenario;
};

export const test = base.extend<PureUrbanFixtures>({
  epic3: async ({ request }, use) => {
    const scenario = await seedEpic3Scenario(request);
    await use(scenario);
  },
});
