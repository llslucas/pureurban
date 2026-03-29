/**
 * Data Factory: User (Usuário)
 *
 * Gera dados de usuário com @faker-js/faker.
 * Suporta 3 roles: admin, driver, student.
 * Cada usuário pertence a uma empresa (companyId) para multi-tenancy.
 *
 * @see knowledge/data-factories.md
 */
import { faker } from '@faker-js/faker';

export type UserRole = 'admin' | 'driver' | 'student';

export type User = {
  id: string;
  email: string;
  name: string;
  password: string;
  role: UserRole;
  companyId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Cria um usuário com dados aleatórios.
 * @param overrides Campos para sobrescrever os valores padrão
 */
export const createUser = (overrides: Partial<User> = {}): User => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  password: faker.internet.password({ length: 12 }),
  role: 'student',
  companyId: faker.string.uuid(),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

/** Cria um usuário admin */
export const createAdmin = (overrides: Partial<User> = {}): User =>
  createUser({ role: 'admin', ...overrides });

/** Cria um motorista */
export const createDriver = (overrides: Partial<User> = {}): User =>
  createUser({ role: 'driver', ...overrides });

/** Cria um aluno */
export const createStudent = (overrides: Partial<User> = {}): User =>
  createUser({ role: 'student', ...overrides });

/**
 * Cria múltiplos usuários.
 * @param count Número de usuários a criar
 * @param overrides Campos compartilhados entre todos os usuários
 */
export const createUsers = (
  count: number,
  overrides: Partial<User> = {},
): User[] => Array.from({ length: count }, () => createUser(overrides));
