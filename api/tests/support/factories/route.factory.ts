/**
 * Data Factory: Route (Rota de transporte)
 *
 * Gera o corpo de `POST /api/v1/routes` com @faker-js/faker.
 * Só os campos do contrato (`create-route.schema.ts`): name, originCity,
 * destinationCity, description?.
 */
import { faker } from '@faker-js/faker';

export type RouteInput = {
  name: string;
  originCity: string;
  destinationCity: string;
  description?: string;
};

export const createRouteInput = (
  overrides: Partial<RouteInput> = {},
): RouteInput => ({
  name: `${faker.location.street()} — ${faker.string.alphanumeric(6)}`,
  originCity: faker.location.city(),
  destinationCity: faker.location.city(),
  ...overrides,
});
