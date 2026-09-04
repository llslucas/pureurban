/**
 * Data Factory: bodies de criação de aluno e motorista.
 *
 * `POST /api/v1/students` e `POST /api/v1/drivers` compartilham o mesmo shape
 * ({ name, email, password >= 8 }). E-mail único por chamada — cada spec do
 * Épico 3 semeia seu próprio tenant e não faz cleanup (ver Design Notes).
 */
import { faker } from '@faker-js/faker';

export type PersonInput = {
  name: string;
  email: string;
  password: string;
};

export const createPersonInput = (
  overrides: Partial<PersonInput> = {},
): PersonInput => ({
  name: faker.person.fullName(),
  email: faker.internet.email({ provider: `e2e-${faker.string.alphanumeric(8).toLowerCase()}.test` }),
  password: 'e2e-password-1234',
  ...overrides,
});
