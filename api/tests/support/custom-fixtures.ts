/**
 * Custom Playwright fixtures para PureUrban.
 *
 * Fixtures customizadas com auto-seed e auto-cleanup.
 * Usar test.extend() para adicionar fixtures ao test object.
 *
 * @see knowledge/fixture-architecture.md
 */
import { test as base } from '@playwright/test';
import { createCompany, type Company } from './factories/company.factory';
import { createUser, type User } from './factories/user.factory';

type PureUrbanFixtures = {
  /** Empresa de teste com auto-cleanup */
  testCompany: Company;
  /** Usuário admin de teste com auto-cleanup */
  testAdmin: User;
};

export const test = base.extend<PureUrbanFixtures>({
  testCompany: async ({ request }, use) => {
    const company = createCompany();

    // TODO: Seed via API quando endpoint POST /api/v1/auth/register existir
    // const response = await request.post('/api/v1/auth/register', { data: company });

    await use(company);

    // TODO: Cleanup via API quando endpoint DELETE existir
  },

  testAdmin: async ({ request }, use) => {
    const admin = createUser({ role: 'admin' });

    // TODO: Seed via API quando endpoint existir
    // const response = await request.post('/api/v1/users', { data: admin });

    await use(admin);

    // TODO: Cleanup via API
  },
});
