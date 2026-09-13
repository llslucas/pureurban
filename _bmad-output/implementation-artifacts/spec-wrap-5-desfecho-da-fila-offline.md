---
title: 'Wrap 5: Desfecho da fila offline (decisão de produto + implementação)'
type: 'bugfix'
created: '2026-09-12'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
gated: 'Matriz D1–D7 APROVADA na íntegra (defaults) pelo Lucas em 13/09/2026'
approval: 'Matriz D1–D7 aprovada na íntegra com os defaults sugeridos pelo Lucas em 13/09/2026'
context:
  - _bmad-output/implementation-artifacts/epic-3-retro-2026-09-07.md
  - _bmad-output/implementation-artifacts/3-4b-check-in-offline-com-fila-de-sincronizacao.md
  - _bmad-output/implementation-artifacts/deferred-work.md
  - _bmad-output/planning-artifacts/spec-4-0-contrato-de-api-ausencia.md
---

<frozen-after-approval reason="human-owned intent — do not transmit unless human approves">

## Intent

**Problem:** O item 3 da retro 3 (aberto desde 07/09) é a última decisão de produto do
MVP sem pouso: o que acontece com um item da fila offline que nunca consegue ser
entregue? Hoje: (1) itens `failed` por `INVALID_QR_CODE` (fora da janela de 24h do
`occurredAt`) prendem o banner vermelho "Registre manualmente" para sempre — `failedCount`
nunca volta a zero, sem ação de reconhecimento, através de reinícios; (2) a fila não tem
`userId`/`companyId` — num aparelho compartilhado, o motorista B drena os itens do
motorista A com o token de B (saem com `DRIVER_NOT_ASSIGNED`); (3) logout não limpa a
fila (itens do motorista anterior sobrevivem à troca de conta); (4) linhas `sent` nunca
são purgadas — a tabela cresce sem limite pela vida da instalação; (5) o dreno bem-sucedido
não invalida nenhuma query (roster/`activeTrip` seguem servindo dado vencido). Temas
irmãos registrados nos reviews da 4.0/4.1 (replay de ausência CANCELADA retorna 201;
semântica de replay de ERRO sob idempotência — 409/404 pinados na key?) alimentam a
mesma decisão e devem ser decididos JUNTO.

**Approach:** Decidir a matriz de desfecho (abaixo), depois implementar: migração da
`offline_queue` (identidade do item), transições de status com expiração alinhada à
janela de 24h, purge de `sent`, logout limpando a fila, invalidação pós-dreno — com
testes. **Este spec NÃO executa sem o Lucas aprovar a matriz** (é decisão de produto
sobre o que o motorista vê quando um embarque falha definitivamente).

</frozen-after-approval>

## Matriz de decisão (defaults sugeridos — APROVADA na íntegra, defaults, 13/09/2026)

| # | Pergunta | Default sugerido | Alternativa |
|---|---|---|---|
| D1 | Item nunca entregue e `occurredAt` fora da janela de 24h | `failed` definitivo com motivo `EXPIRED`, banner oferece "dispensar" (reconhecimento explicito do motorista); `failedCount` volta a zero após dispensar | manter preso até registro manual (status quo) |
| D2 | Erros determinísticos do servidor (400/403/404) no dreno | marcar `failed` com o código — retry nunca vai resolver | reenfileirar para sempre |
| D3 | Replay de ausência CANCELADA (4.1) / de ERRO sob idempotência (4.0) | resposta 2xx com estado atual representado no corpo (o dreno trata como entregue e marca `sent`); 409/404 de conflito real marcam `failed` por D2 | pin de erro na key |
| D4 | Identidade na fila | coluna `userId` (+ `companyId`) na `offline_queue`; `listPending` filtra pelo usuário logado; item de outro usuário fica invisível (não drenado) | apagar itens de outro usuário no login |
| D5 | Logout | fila do usuário é PURGADA no logout (embarques nunca enviados são perdidos com aviso no logout — "N embarques não sincronizados serão descartados") | manter e drenar depois com o token novo (perigoso: token de B em item de A) |
| D6 | Purge de `sent` | deletar linhas `sent` com mais de 7 dias no boot (ou após dreno bem-sucedido, `DELETE WHERE status='sent' AND updated_at < date`) | nunca purgar (status quo) |
| D7 | Pós-dreno | invalidar `['trip', id, 'students']` e `['activeTrip']` (o wrap-1/2 já caminham nessa direção — coordenar) | refetch por `staleTime` apenas |

## Code Map

- `mobile/src/lib/database-migrations.ts` — schema da `offline_queue` (hoje sem
  `userId`; SEM versionamento de migração — criar migração v2 é parte do escopo)
- `mobile/src/lib/offline-queue-storage.ts` — `markSent`/`listPending` (só status e
  operação) + purge inexistente
- `mobile/src/utils/offline-queue.ts` — FIFO, backoff 1s→30s, ≤5 tentativas,
  `SETTLED_CODES`, transições de status
- `mobile/src/hooks/use-offline-sync.ts` — dreno, contadores, banner global
- `mobile/src/stores/auth.store.ts` — logout (hook do D5)
- `mobile/src/app/(driver)/scan.tsx` — banner/contador (`setBoardedCount` divergente do
  servidor quando item vai a `failed` — nota do defer da 3.4b; manter local/informativo)
- Contrato: janela de 24h do `occurredAt` (3.3a/3.0) e `INVALID_QR_CODE`
  `CANCELLATION_PERIOD_EXPIRED` (4.3)

## Tasks & Acceptance

**Task 1 — Migração v2 da `offline_queue` (D4).**
- AC1: migração versionada adiciona `user_id` (e `company_id`); instalação existente
  migra sem perder itens pendentes (teste: abrir banco v1, migrar, itens preservados).
- AC2: `listPending` (e todo o ciclo) operam só sobre itens do usuário logado; item de
  outro usuário nunca é drenado (teste com dois usuários no mesmo storage).

**Task 2 — Transições de desfecho (D1, D2, D3).**
- AC3: erro determinístico (400/403/404/`CANCELLATION_PERIOD_EXPIRED`) ⇒ `failed` com
  motivo; retry NÃO reprocessa item `failed` definitivo.
- AC4: item com `occurredAt` fora da janela de 24h ⇒ `failed`/`EXPIRED` na tentativa
  seguinte (sem POST desperdiçado quando detectável localmente).
- AC5: replay 2xx com estado representado (D3) ⇒ tratado como entregue (`sent`).
- AC6: banner vermelho tem ação "dispensar" que zera `failedCount`; suíte cobre o ciclo
  completo falha → banner → dispensar → banner some.

**Task 3 — Logout e purge (D5, D6).**
- AC7: logout purga a fila e o aviso de "N embarques não sincronizados" aparece quando
  houver itens pendentes (teste: logout com fila pendente; logout com fila vazia não
  avisa).
- AC8: linhas `sent` antigas são purgadas no boot; teto de 500 itens conta só `pending`
  (comportamento atual preservado).

**Task 4 — Invalidação pós-dreno (D7).**
- AC9: dreno com sucesso invalida roster e `activeTrip` (teste: contador da lista
  reflete o embarque enfileirado após o dreno, sem remount manual).

## Boundaries & Constraints

- A interface permanece o banner global — badge por item (✓/⏳/✗) segue na Fase 2
  (corte consciente da sprint-change-proposal-2026-08-28).
- Sem mudança na API (`api/` intocado): os desfechos usam códigos já publicados. Se D3
  exigir campo novo em corpo de resposta, PARAR — vira ajuste de contrato (wrap-3 reabre
  para isso).
- Migração de banco local do mobile: sem versionamento hoje, criar o mecanismo mínimo
  (v1→v2) é escopo; reescrever o mecanismo de sync não é.
- `expo-sqlite` isolado em `offline-queue-storage.ts` (padrão da 3.4b); testes da lógica
  continuam contra a interface (`QueueStorage`) — e a bateria contra SQLite real é o
  wrap-2 (coordenar, não duplicar).

## Verification

```bash
cd mobile && npm test          # ciclo completo: enfileirar → drenar → falhar → dispensar
cd api && npm run test:e2e     # regressão do boarding (fila não toca a API, mas os e2e guardam o contrato)
cd api && npm run gate         # completo no fim
```

## Ordem de execução

DEPOIS do wrap-1 (invalidação pós-dreno é vizinha do AC11 do dreno) e de preferência
depois do wrap-2 (bateria de QueueStorage contra SQLite real ajuda a validar a migração).
GATED: executar só com a matriz D1–D7 aprovada (inteira ou com overrides anotados aqui).

## Implementation Notes

**Branch:** `fix/wrap-5-desfecho-da-fila-offline` (a partir da `main` 730af81).

**Decisões de implementação (matriz aprovada em defaults):**

- **Migração versionada (D4/AC1):** mecanismo mínimo via `PRAGMA user_version`
  (`database-migrations.ts`). Instalação nova nasce na v2 (tabela completa); instalação
  da 3.4b (v1, sem versão) migra por `ALTER TABLE` coluna a coluna (idempotente contra
  crash no meio da migração) + backfill `updated_at = created_at` FORA do guard da
  coluna (crash entre ALTER e UPDATE completaria o backfill na reabertura — achado de
  review). Teste de crash-state incluído.
- **Linhas v1 órfãs (`user_id` NULL):** preservadas (AC1), mas INVISÍVEIS para todos —
  o dono é irrecuperável e atribuí-las à sessão atual recriaria o dreno cruzado do D4.
  Saem de cena na `purgeUser` (`OR user_id IS NULL`) no logout.
- **`companyId`:** não existe no `AuthUser` (e a API não muda — boundary do spec); o
  dono é estampado no scan com `user.id` + `activeTrip.companyId`. A coluna é anotação
  de tenant conforme a matriz D4 ("userId (+ companyId)"); nenhuma query filtra por ela
  hoje.
- **Teto de 500 virou POR USUÁRIO:** consequência coerente do escopo D4 (a fila cheia
  de A não pode bloquear B). Pinned por teste na bateria; AC8's "comportamento
  preservado" segue valendo no sentido do teto contar só `pending`.
- **Aviso do D5/AC7 na TELA DE LOGIN (desvio consciente do congelado):** o congelado
  diz "aviso no logout — serão descartados" (confirmação prévia), mas NÃO EXISTE botão
  de logout no happy path do motorista (defer registrado no deferred-work da 1.6/3.5b):
  o logout real é programático (401 do api-client, guardas de role). Implementado:
  `auth.store.logout()` notifica listeners (novo `registerLogoutListener`); o
  `offline-queue-lifecycle` (registrado no root layout) conta os pendentes, purga e
  publica o aviso como PROMISE antes do primeiro await (regressão de race com o mount
  do login — achado de review); o login consome e exibe "N embarques não sincronizados
  foram descartados ao sair da conta." (passado, pós-fato).
- **Purga de `sent` (D6/AC8) no BOOT DE VERDADE:** vive no registro do lifecycle (root
  layout, qualquer sessão), não no hook do motorista (achado de review: o mount do
  driver group não é boot). `markSent`/`markFailed`/`bumpAttempt` estampam `updated_at`;
  o corte é `Date.now() - 7 dias`.
- **EXPIRED local (D1/AC4):** `drainNext` compara `Date.now()` com a janela de 24h
  (`OCCURRENCE_WINDOW_MS`) e marca `failed`/`EXPIRED` SEM POST; `createdAt` ilegível dá
  NaN → não expira localmente (o servidor decide). As suítes congelam o relógio
  (`jest.setSystemTime`) — os itens de data fixa da bateria "envelheceriam" com o
  calendário real.
- **Invalidação (D7/AC9):** `DrainStep` `sent`/`settled` agora carrega `tripId`; o hook
  invalida `tripStudentsKey(tripId)` de cada viagem entregue + `activeTripKey`. O pin de
  baseline DS1 do wrap-1 (use-offline-sync.test) foi revertido COM esta mudança, como o
  próprio teste anunciava.
- **A11y do banner (achado de review):** o container NÃO tem mais `accessible` — ele
  achataria a subárvore e esconderia o botão "Dispensar" do VoiceOver. O papel `alert`
  migrou para os textos (auto-acessíveis) e o `accessibilityLiveRegion` ficou no
  container.
- **Isolamento de listeners de logout (achado de review):** um listener que lança não
  aborta os demais nem o logout.

**Arquivos:** produção — `utils/offline-queue.ts` (owner, escopo, expiração, tripId nos
passos, `SENT_RETENTION_MS`/`OCCURRENCE_WINDOW_MS`), `lib/database-migrations.ts` (v2),
`lib/offline-queue-storage.ts` (SQL com escopo + purgas + updated_at),
`hooks/use-offline-sync.ts` (escopo por sessão, invalidação, dismissFailed),
`stores/auth.store.ts` (registerLogoutListener), `lib/offline-discard-notice.ts` (novo),
`lib/offline-queue-lifecycle.ts` (novo), `components/offline-banner.tsx` (Dispensar),
`app/(driver)/_layout.tsx`, `app/(driver)/scan.tsx` (owner no attempt), `app/_layout.tsx`
(registro global), `app/(auth)/login.tsx` (aviso). Testes — baterias atualizadas e
novos: `utils/describe-queue-storage.ts`, `utils/offline-queue.test.ts`,
`lib/offline-queue-storage.test.ts` (migração v1→v2 + crash + órfãs),
`lib/offline-queue-lifecycle.test.ts` (novo), `hooks/use-offline-sync.test.tsx` (DS1
revertido + ciclo AC6), `components/offline-banner.test.tsx` (ciclo AC6 + a11y),
`app/(auth)/login.test.tsx` (novo).

**Contexto adicional usado:** o gate roda nesta máquina com
`E2E_API_URL=http://localhost:3001` (o `api/.env` usa `PORT=3001`; default do script é
3000) — sem isso o passo 3/5 finge timeout de API.

## Review Triage Log

Blind Hunter (context-free), 14 achados em 2026-09-13. 7 patches aplicados, 3
rejeitados com evidência, 1 defer, 1 false, 2 absorvidos como docs/testes.

1. **Race do aviso de descarte** (promise publicada só após a purga; login monta
   antes e consome null) — REAL, high. PATCH: promise publicada antes do primeiro
   `await`; regressão pinada em `offline-queue-lifecycle.test.ts` ("o aviso é
   publicado como PROMISE no despacho do logout").
2. **Backfill da migração dentro do guard da coluna** (crash entre ALTER e UPDATE
   deixaria `updated_at` NULL para sempre; purga de `sent` nunca casaria) — REAL,
   medium. PATCH: UPDATE fora do guard, idempotente por `WHERE IS NULL`.
3. **Sem teste do estado de crash da migração** — REAL, medium. PATCH: caso
   "crash no meio da migração" em `offline-queue-storage.test.ts`.
4. **Purga de `sent` no mount do driver layout, não no boot** — REAL, low. PATCH:
   movida para o registro do `offline-queue-lifecycle` (root layout, qualquer
   sessão); assertion movida do teste do hook para o do lifecycle.
5. **Teto de 500 virou por-usuário** — REAL, low, aceito como consequência
   coerente do D4 (a fila cheia de A não bloqueia B). PINNADO: caso na bateria
   ("o teto de 500 é POR USUÁRIO") + anotado nas Implementation Notes.
6. **Copy "Registre manualmente" é impossível para EXPIRED; dispensar sem undo** —
   real, low, REJEITADO como patch: a copy é a NFR13 literal e a bateria global é
   a interface aprovada; discriminar motivo por item é o corte consciente da
   Fase 2. DEFERIDO para o trabalho de badge (deferred-work.md).
7. **Botão "Dispensar" inalcançável no VoiceOver** (`accessible` no container
   achata a subárvore em iOS) — REAL, medium. PATCH: `accessible` removido do
   container, papel `alert` migrado para os textos, teste de
   `getByRole('button', { name: /dispensar/i })`.
8. **Login sem teste do aviso (metade UI do AC7)** — REAL, low. PATCH:
   `src/login-screen.test.tsx` (3 casos). Lição do próprio patch: o arquivo
   NASCEU em `src/app/(auth)/` e o Expo Router tentou bundlar o
   `@testing-library/react-native` como rota, derrubando o app no browser e o
   pw:e2e — movido para `src/` (convenção dos testes de tela).
9. **Fake do hook filtrava `purgeSentBefore` por `createdAt`** (produção usa
   `updated_at`) — REAL, low. PATCH: o fake do hook parou de filtrar (a asserção
   do hook é de CHAMADA; a fidelidade da filtragem é da bateria e do teste SQLite
   por SQL cru).
10. **Spec stale (gated+approval; desvio do D5)** — válido. PATCH: frontmatter
    atualizado + desvio do aviso documentado nas Implementation Notes.
11. **Órfãs v1 sem saída exceto logout** — real, low, REJEITADO: ≤500 linhas,
    invisíveis por desenho (D4); apagá-las na migração violaria o AC1
    ("preservadas").
12. **`companyId` gravado mas nunca lido** — FALSE: a matriz D4 aprovada pede a
    coluna explicitamente ("coluna userId (+ companyId)"); é anotação de tenant
    para o Tier 2, não filtro.
13. **Listeners de logout sem isolamento de erro** — REAL, low. PATCH: try/catch
    no loop de `logout()` (um listener que lança não aborta os demais nem o
    logout).
14. **Logout no meio do dreno superconta o aviso** — real, low, REJEITADO: corrida
    rara (logout exatamente entre o `listPending` e o `markSent`); o servidor
    RECEBE o embarque (nenhuma perda real — só o número do aviso pode errar);
    abortar dreno no logout seria mecanismo novo sem AC que o peça.
