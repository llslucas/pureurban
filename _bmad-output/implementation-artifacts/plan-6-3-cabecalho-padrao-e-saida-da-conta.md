---
title: 'Story 6.3: cabeçalho padrão e saída da conta'
type: 'feature'
ticket: '6-3-cabecalho-padrao-e-saida-da-conta'
created: '2026-09-26'
status: 'done'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: 'babad60e6105834ba326f41101d82cf7b106ca19'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O header de `(driver)` e `(student)` é o default do React Navigation, sem estilo, e
duas telas repetem o título num H1 logo abaixo ("Gestão de Viagem" sob "Viagem", "Minhas Rotas" sob
"Minhas rotas"). Motorista e aluno não têm como sair da conta; na demo, trocar de papel exige
limpar o storage (T4 e T7 do EXPERIENCE).

**Approach:** Um `AppHeader` como `screenOptions` compartilhado pelos Stacks dos dois grupos
(DESIGN → AppHeader), com um menu de overflow `dots-vertical` à direita que oferece "Sair" (D-UX-5).
"Sair" chama `useAuthStore().logout()`. No motorista, se houver check-ins pendentes na fila
offline, um `ConfirmDialog` avisa antes que eles serão descartados. Os dois H1 duplicados saem.

## Boundaries & Constraints

**Always:**
- Header: fundo `canvas`, título `typography.title` (Inter 600, 18) em `text` (ink), `headerShadowVisible: false` e divisor `hairline` de 1px via `headerBackground`, cor de tint `text`. Cores só de `lightPalette`; nenhum hex novo.
- Ícone do overflow `dots-vertical`, com alvo ≥ 48dp e nome acessível "Mais opções". Item "Sair" com ícone MDI `logout`.
- A saída chama `logout()` e depois `router.replace('/(auth)/login')`, na mesma ordem de `scan.tsx:355-360` e `qr-code.tsx:65-66`.
- A contagem vem do `pendingCount` que o `(driver)/_layout` já obtém de `useOfflineSync()`. O aluno não tem fila, então sai direto.
- Diálogo quando `pendingCount > 0`: título "Sair da conta?"; mensagem "1 embarque ainda não foi enviado e será descartado." ou "N embarques ainda não foram enviados e serão descartados."; confirmação "Sair", `destructive`. "Voltar" fecha sem sair.
- Contrato de teste: o texto "Gestão de Viagem" deixa de existir. Por isso a tela de viagem ganha `testID="trip-screen"` nos dois `ScrollView`, e o Jest (`trip-screen.test.tsx:403`) e o e2e (`api/tests/support/helpers/e2e-driver.ts:30`) passam a esperar por ele neste mesmo PR.
- Comentários novos em inglês, só o porquê.

**Never:**
- Mudar títulos das telas, navegação, `initialRouteName` ou o header de `(admin)`/`(auth)`.
- Adicionar "Minhas rotas" ao menu (D-UX-6 recusada) ou qualquer outro item além de "Sair".
- Mexer na purga da fila (`offline-queue-lifecycle.ts`) ou no aviso pós-logout do login: o diálogo é um aviso **antes**, e o aviso do login continua valendo para os outros caminhos de saída.
- Restyle das telas além de remover os dois H1 (e o subtítulo de routes fica).
- Dependência nova.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sair sem fila | motorista, `pendingCount=0`, toca Mais opções → Sair | `logout()` + replace para o login, sem diálogo | — |
| Sair com fila | `pendingCount=2` | ConfirmDialog "2 embarques ainda não foram enviados e serão descartados."; logout só ao tocar "Sair" | — |
| Singular | `pendingCount=1` | "1 embarque ainda não foi enviado e será descartado." | — |
| Desistir | diálogo aberto, toca "Voltar" ou fora | Diálogo fecha, sessão intacta | — |
| Aluno | qualquer tela de `(student)` | Menu com "Sair"; sai direto | — |

</frozen-after-approval>

## Code Map

- `mobile/src/app/(driver)/_layout.tsx` -- Stack com 4 telas e títulos; já calcula `pendingCount` com `useOfflineSync()` e renderiza o `OfflineBanner` abaixo do Stack. Adicionar `screenOptions` + `headerRight`.
- `mobile/src/app/(student)/_layout.tsx` -- Stack com 3 telas (usa `;`, os outros arquivos não usam). Adicionar `screenOptions`.
- `mobile/src/app/_layout.tsx` -- `Stack.Protected` por `isAuthenticated`, `PaperProvider` (que traz o `Portal.Host` usado pelo Dialog) e `navigationTheme`. Não mexer.
- `mobile/src/stores/auth.store.ts` -- `logout()` limpa tokens, cache e dispara os listeners (purga da fila). Só consumir.
- `mobile/src/app/(admin)/home.tsx` -- saída do admin (`onPress={logout}`), a referência do AC. Não mexer.
- `mobile/src/components/ui/confirm-dialog.tsx` -- `ConfirmDialog {visible,title,message,confirmLabel,onConfirm,onDismiss,destructive,testID}`; os botões usam `testID-cancel`/`testID-confirm`.
- `mobile/src/components/ui/mdi-icon.tsx`, `test-utils.tsx` -- `renderUi` (PaperProvider + SafeArea) para os testes.
- `mobile/src/lib/tokens.ts` (`typography.title`, `spacing.touchMin`), `lib/palette.ts` (`lightPalette.canvas/text/hairline`).
- `mobile/src/app/(driver)/trip.tsx:392,444` -- os dois `<Text style={styles.title}>Gestão de Viagem</Text>` (estados 1 e 2); estilo `title` em :524.
- `mobile/src/app/(driver)/routes.tsx:82` -- `Minhas Rotas`; estilo `title` em :159. O `subtitle` fica.
- `mobile/src/trip-screen.test.tsx:403` e `api/tests/support/helpers/e2e-driver.ts:30` -- os únicos asserts do texto removido. O helper é usado por 5 specs Playwright.
- `@react-navigation/native-stack` 7.14.9: `headerBackground`, `headerTitleStyle` (fontFamily/fontSize/fontWeight), `headerTintColor`, `headerRight`.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/account-menu.tsx` -- NEW `AccountMenu {pendingCount?: number}`: `IconButton` `dots-vertical` ("Mais opções", 48dp) ancorando um `Menu` do Paper com "Sair". Aplica a regra de pendentes/diálogo e sai com `logout()` + `router.replace`. `testID`s: `account-menu-button`, `account-menu-logout`, `logout-confirm-dialog`.
- [x] `mobile/src/lib/app-header.tsx` -- NEW `appHeaderOptions` (objeto de `NativeStackNavigationOptions`) com fundo, título, tint, sombra e `headerBackground` com divisor, e `headerRight: () => <AccountMenu />`.
- [x] `mobile/src/app/(driver)/_layout.tsx` -- `screenOptions={{ ...appHeaderOptions, headerRight: () => <AccountMenu pendingCount={pendingCount} /> }}`.
- [x] `mobile/src/app/(student)/_layout.tsx` -- `screenOptions={appHeaderOptions}`.
- [x] `mobile/src/app/(driver)/trip.tsx` -- remover os dois H1 e o estilo `title`; adicionar `testID="trip-screen"` nos dois `ScrollView`.
- [x] `mobile/src/app/(driver)/routes.tsx` -- remover o H1 e o estilo `title`.
- [x] `mobile/src/trip-screen.test.tsx` -- `findByText('Gestão de Viagem')` → `findByTestId('trip-screen')`.
- [x] `api/tests/support/helpers/e2e-driver.ts` -- esperar `page.getByTestId('trip-screen')` no lugar do texto.
- [x] `mobile/src/components/account-menu.test.tsx` -- NEW, cobrindo a matriz de I/O com `logout` e `router` mockados, e o alvo de 48dp.

**Acceptance Criteria:**
- Given qualquer tela de `(driver)` ou `(student)`, when é exibida, then o header tem fundo `canvas`, título Inter 600 em ink, divisor `hairline` e "Mais opções" à direita.
- Given trip e routes, when faço grep por `Gestão de Viagem|Minhas Rotas` em `mobile/src/app`, then não há resultado.
- Given a suíte Jest, when rodo `npm test`, then tudo passa, incluindo a guarda da paleta.

## Implementation Notes

- Implementado direto na sessão principal (o contexto da investigação já estava carregado).
- A trava `routes` do `palette.guard.test.ts` assertava o estilo `title` do H1 removido. A linha saiu, e entrou uma trava nova para `lib/app-header.tsx` (`headerTintColor` em `text`, fundo `canvas`, divisor `hairline`).
- O estado de erro de `trip.tsx` ("Não foi possível carregar a viagem") também usa `styles.title`, então o estilo ficou. Só os dois H1 saíram.
- O `IconButton` do Paper põe o `testID` no touchable interno, e o tamanho de 48dp fica no Surface acima dele. O teste sobe pela árvore até achar o `width`.
- No web, o clique do Playwright no texto "Sair" é interceptado pela linha do próprio `Menu.Item`. O clique pelo `testID` do item funciona. Um usuário real toca a linha inteira, então o comportamento não muda.
- Verificação no Expo Web (390×844, `EXPO_PUBLIC_USE_MOCKS=1`): header com título semibold, divisor e menu em trip, routes e home do aluno. "Sair" leva ao `/login` para motorista e aluno, sem erros de página. Capturas antes/depois ficam fora do repo, no scratchpad da sessão. O diálogo com fila pendente não foi exercitado no web (exigiria popular o SQLite do web) e está coberto pelo Jest.
- Suíte: 42 suítes / 490 testes verdes; lint limpo; `tsc` só com os 3 erros pré-existentes.
- Correções da revisão: `appHeaderOptions` perdeu o `headerRight` default (cada layout liga o próprio `AccountMenu`, então o motorista não cai num menu sem contagem); novo `src/group-layouts.test.tsx` renderiza os dois `_layout` com um `Stack` stub que só invoca o `headerRight` (validado por mutação: tirar o `pendingCount` do layout do motorista reprova o teste); o `AccountMenu` congela a contagem ao abrir o diálogo; o teste de "Voltar" confirma que o diálogo fecha (timeout de 5s: sob a suíte cheia a animação de saída do Dialog do Paper passa de 1s); o comentário de `offline-queue-lifecycle.test.ts` que dizia não haver "Sair" foi corrigido. Suíte: 43 suítes / 493 testes verdes (3 rodadas), lint limpo.
- A entrada de `deferred-work.md` (linha ~145, "STUDENT e DRIVER não têm como sair da sessão") fica resolvida por esta story; não foi editada (o workflow não altera entradas existentes).

## Plan Change Log

## Review Triage Log

### Passada 1 (lentes: blind-hunter, edge-case-hunter, verification-gap, intent-alignment)

Contagem: 0 high, 2 medium, 15 low, 3 false, 0 maybe-false. Sem intent_gap/bad_plan: 4 patch, 0 defer, o resto rejeitado.

| # | Lente | Achado | Veredito | Rota / evidência |
|---|---|---|---|---|
| 1 | verification-gap + blind + intent | Nenhum teste renderiza os `_layout`: tirar o `pendingCount` do motorista ou o menu do aluno não reprova nada | medium | patch: `group-layouts.test.tsx` (motorista com fila → diálogo; aluno → sai direto), validado por mutação |
| 2 | blind | `headerRight` default `<AccountMenu />` em `appHeaderOptions` esconde o aviso de qualquer stack que esqueça o override; `lib/` passa a depender de `components/` | medium | patch: default removido, os dois layouts ligam o menu |
| 3 | edge | Diálogo aberto enquanto o dreno esvazia a fila passa a dizer "0 embarques ... serão descartados" | low | patch: contagem congelada em `confirmCount` ao abrir |
| 4 | verification-gap (other) | `offline-queue-lifecycle.test.ts:7-11` diz que não existe "Sair" no motorista | low | patch: comentário atualizado |
| 5 | blind | Testes não verificam que menu/diálogo fecham após a ação | low | patch parcial: o "Voltar" assere o fechamento; no caminho de saída o grupo desmonta com o logout |
| 6 | edge | Check-in enfileirado logo antes do "Sair" com a contagem ainda não atualizada pula o diálogo | low | rejeitado: janela de milissegundos; o aviso pós-logout do login (D5/AC7) continua contando o descartado; a correção exige leitura assíncrona do storage no toque |
| 7 | edge | "Sair" antes do primeiro `refreshCounts` do `useOfflineSync` | low | rejeitado: mesmo motivo do #6 (a contagem inicial resolve ao montar o layout) |
| 8 | edge + blind | Diálogo conta só `pending`; `purgeUser` também apaga `failed` e órfãos | false | É a regra já vigente do `offline-queue-lifecycle.ts` (aviso conta "o que o motorista PERDE": pendentes); `failed` já foi sinalizado no banner. O intent fala em check-ins pendentes |
| 9 | edge | Toque duplo em "Sair"/confirmar chama `logout()` e `replace` duas vezes | low | rejeitado: o segundo `logout()` encontra `user` nulo e não dispara listeners; limpar storage é idempotente; nenhum dano nomeado |
| 10 | edge (claim) | O plano manda remover o estilo `title` do trip, mas ele ficou | false | O estado de erro usa o estilo (registrado nas Implementation Notes); a remoção seria bug |
| 11 | blind | `testID="trip-screen"` só nos dois ScrollView; erro no cold start vira timeout de 30s no helper e2e | false | Antes o helper esperava "Gestão de Viagem", que também não existia nos estados de loading/erro; comportamento idêntico |
| 12 | blind | Sem spec Playwright para o novo logout | low | rejeitado: o AC pede Jest; o fluxo foi verificado no web à mão; spec nova é escopo de teste além da story |
| 13 | blind | Cores do `account-menu.tsx` sem trava na guarda da paleta | low | rejeitado: a guarda varre hex em todo `src/`; as travas por call-site são seletivas |
| 14 | blind | Trava do `app-header` não cobre `headerTitleStyle` | low | rejeitado: tipografia não é papel de paleta; cosmético |
| 15 | blind | "Mais opções" é genérico para leitor de tela | low | rejeitado: rótulo padrão de overflow; o item "Sair" é anunciado ao abrir |
| 16 | blind | JSDoc em `AccountMenuProps.pendingCount` | low | rejeitado: o comentário carrega o porquê (purga D5/AC7); `ConfirmDialog` usa o mesmo estilo |
| 17 | blind | Espaçamento do `routes.tsx` e `styles.title` do erro do trip não revistos | low | rejeitado: restyle das telas é da 6.5/6.13 |
| 18 | intent | Header renderizado (tipografia, sombra, back 48dp) não é assertado por teste | low | rejeitado: verificado no Expo Web com capturas; o back é o nativo (EXPERIENCE: "Back nativo") |
| 19 | intent | `logout()` real e a purga não são exercitados pelos testes novos | low | rejeitado: caminho pré-existente coberto por `offline-queue-lifecycle.test.ts` |
| 20 | intent | Helper Playwright alterado sem evidência de execução | low | rejeitado: o seletor `trip-screen` foi confirmado visível no web (script de verificação); a suíte Playwright exige API + banco |

## Design Notes

**Por que o `AccountMenu` é um componente e não mora no `ui/`:** ele conhece o `auth.store`, o
router e a regra da fila, que são de feature. O `ui/` continua sem depender de estado do app (lição
do item 5 da revisão da 6.2).

**Por que `headerBackground` e não `headerStyle`:** no native-stack, `headerStyle` só aceita
`backgroundColor`. Borda inferior só com um fundo próprio:

```tsx
headerBackground: () => (
  <View style={{ flex: 1, backgroundColor: lightPalette.canvas,
    borderBottomWidth: 1, borderBottomColor: lightPalette.hairline }} />
),
```

**Menu dentro do header:** o `Menu` e o `Dialog` do Paper usam o `Portal.Host` do `PaperProvider`
raiz, então funcionam a partir do `headerRight`. Feche o menu antes de abrir o diálogo, senão os
dois ficam empilhados.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte toda verde
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: 0 erros novos (3 já existem: `scan.tsx:316`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`)
- `grep -rnE "Gestão de Viagem|Minhas Rotas" mobile/src/app` -- expected: vazio

**Manual checks:**
- Expo Web (390×844) com mocks: capturas antes/depois do header em trip, routes e home do aluno; menu aberto; diálogo com fila; saída levando ao login.
