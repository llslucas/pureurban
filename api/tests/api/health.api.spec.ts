/**
 * Teste API de exemplo: Health Check
 *
 * Demonstra o padrão Given/When/Then para testes de API com Playwright.
 * Este teste valida que o endpoint raiz (GET /) retorna 200.
 *
 * Pattern: API-first testing (sem browser)
 * @see knowledge/api-request.md
 */
import { test, expect } from '../support/merged-fixtures';

test.describe('Health Check API', () => {
  test('GET / deve retornar 200 com "Hello World!"', async ({ request }) => {
    // Given: API rodando em baseURL (http://localhost:3000)

    // When: faço GET na raiz
    const response = await request.get('/');

    // Then: resposta é 200 com corpo "Hello World!"
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe('Hello World!');
  });
});
