/**
 * Merged Playwright fixtures for PureUrban tests.
 *
 * Combina fixtures do @playwright/test com utilities customizadas.
 * Futuramente, adicionar @seontechnologies/playwright-utils fixtures aqui
 * quando o pacote estiver instalado.
 *
 * @see knowledge/fixtures-composition.md
 * @see knowledge/overview.md
 */
import { test as base, expect } from '@playwright/test';

// Quando @seontechnologies/playwright-utils estiver instalado, descomentar:
// import { mergeTests } from '@playwright/test';
// import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
// import { test as authFixture } from '@seontechnologies/playwright-utils/auth-session/fixtures';
// import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
// import { test as logFixture } from '@seontechnologies/playwright-utils/log/fixtures';
// import { test as customFixtures } from './custom-fixtures';
//
// export const test = mergeTests(
//   apiRequestFixture,
//   authFixture,
//   recurseFixture,
//   logFixture,
//   customFixtures,
// );

// Versão básica (sem playwright-utils):
export const test = base;

export { expect };
