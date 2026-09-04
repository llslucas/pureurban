/**
 * Ponto único de importação das fixtures Playwright do PureUrban.
 *
 * Combina o `test` base com as fixtures customizadas (`epic3`). Importe daqui,
 * nunca de `@playwright/test` direto, para que os specs herdem o seed do Épico 3.
 */
import { mergeTests } from '@playwright/test';
import { expect } from '@playwright/test';
import { test as customFixtures } from './custom-fixtures';

export const test = mergeTests(customFixtures);

export { expect };
