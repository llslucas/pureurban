/**
 * Seed helpers — utilitários para setup de dados via API.
 *
 * Use API calls para seed (rápido), não UI navigation.
 *
 * @see knowledge/data-factories.md
 */
import { APIRequestContext } from '@playwright/test';
import { createCompany, type Company } from '../factories/company.factory';
import { createUser, type User } from '../factories/user.factory';

/**
 * Cria uma empresa via API e retorna os dados.
 *
 * TODO: Implementar quando POST /api/v1/auth/register existir (Story 2.1)
 */
export async function seedCompany(
  request: APIRequestContext,
  overrides: Partial<Company> = {},
): Promise<Company> {
  const company = createCompany(overrides);

  // TODO: Descomentar quando endpoint existir
  // const response = await request.post('/api/v1/auth/register', {
  //   data: { name: company.name },
  // });
  // if (!response.ok()) {
  //   throw new Error(`Failed to seed company: ${response.status()}`);
  // }
  // const body = await response.json();
  // return { ...company, ...body.data };

  return company;
}

/**
 * Cria um usuário via API e retorna os dados.
 *
 * TODO: Implementar quando POST /api/v1/users existir (Story 2.3/2.4)
 */
export async function seedUser(
  request: APIRequestContext,
  overrides: Partial<User> = {},
): Promise<User> {
  const user = createUser(overrides);

  // TODO: Descomentar quando endpoint existir
  // const response = await request.post('/api/v1/users', {
  //   data: user,
  // });
  // if (!response.ok()) {
  //   throw new Error(`Failed to seed user: ${response.status()}`);
  // }

  return user;
}
