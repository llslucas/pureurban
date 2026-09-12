---
title: 'Wrap 5: Desfecho da fila offline (decisão de produto + implementação)'
type: 'bugfix'
created: '2026-09-12'
status: 'ready-for-dev'
route: 'oneshot'
review_loop_iteration: 0
gated: 'exige aprovação do Lucas na matriz de decisão antes de executar'
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

## Matriz de decisão (defaults sugeridos — aprovar/editar antes de executar)

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
