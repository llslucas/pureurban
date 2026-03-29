/**
 * Data Factory: Company (Empresa)
 *
 * Gera dados de empresa com @faker-js/faker.
 * Overrides permitem customizar campos específicos para cada teste.
 *
 * @see knowledge/data-factories.md
 */
import { faker } from '@faker-js/faker';

export type Company = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Cria uma empresa com dados aleatórios.
 * @param overrides Campos para sobrescrever os valores padrão
 */
export const createCompany = (overrides: Partial<Company> = {}): Company => ({
  id: faker.string.uuid(),
  name: faker.company.name(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/**
 * Cria múltiplas empresas.
 * @param count Número de empresas a criar
 * @param overrides Campos compartilhados entre todas as empresas
 */
export const createCompanies = (
  count: number,
  overrides: Partial<Company> = {},
): Company[] => Array.from({ length: count }, () => createCompany(overrides));
