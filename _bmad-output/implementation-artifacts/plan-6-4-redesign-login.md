---
title: 'Story 6.4: redesign do login'
type: 'feature'
ticket: '6-4-redesign-login'
created: '2026-09-26'
status: 'built'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
baseline_revision: '23e13749c5c8dfa6b80b78583c8b2c2ec36009c0'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-pureurban-2026-09-26/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O login é a palavra "PureUrban" em negrito sobre cinza, com botão de raio 8, erro em `HelperText` 12px vermelho e o aviso de descarte da fila (D5) num `HelperText info` quase invisível — o primeiro contato com o app parece protótipo (EXPERIENCE.md → Achados por tela, `audit/light-01`, `light-02`).

**Approach:** Restyle da tela `(auth)/login` conforme "Login — P0": hero `brand` (amarelo-escolar, D-UX-1 aprovada) no topo com ícone `bus-school`, wordmark e tagline; cartão com e-mail, senha (olho 48dp) e **Entrar** via `PrimaryAction` 56dp; erro em `Banner` `error` acima do botão; aviso de descarte em `Banner` `warning` no topo do formulário; com o teclado aberto o hero encolhe. Lógica de login intocada.

## Boundaries & Constraints

**Always:**
- Fluxo idêntico: validação, normalização do e-mail, checagem de role antes do `login()`, `router.replace`, `consumeDiscardNotice` — só a apresentação muda.
- Contrato de teste: `#login-email`, `#login-password`, `#login-submit` continuam como `id` do DOM no web; nome acessível do botão "Entrar"; rótulos "Email"/"Senha"; mensagens de erro e de descarte com o texto atual.
- Cores só de `lib/palette.ts` (`brand`, `onBrand`, `canvas`, `surfaceSoft`…) e medidas de `lib/tokens.ts`; nenhum hex novo; `palette.guard.test.ts` verde.
- Animação do hero respeita `useReducedMotion()` (corte seco ou cross-fade de `motion.reduced`).
- Botão do olho com alvo de toque ≥ 48dp e rótulo acessível "Mostrar senha"/"Ocultar senha".

**Never:**
- Mudar navegação, `_layout` do `(auth)` (header continua oculto) ou o `app.json`/splash.
- Dependência nova, ou tocar no `darkTheme` (D-UX-4).
- Alterar `Banner` além do necessário; o `ui/` não passa a depender de estado do app.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tela limpa | sem sessão, sem aviso D5 | hero amarelo + cartão; nenhum Banner | — |
| Campo vazio | "Entrar" com e-mail ou senha em branco | Banner `error` "Preencha email e senha para continuar." acima do botão | sem chamada ao `authService` |
| Falha no servidor | `authService.login` rejeita com `Error` | Banner `error` com `err.message`; botão volta do loading | não-`Error` → "Erro ao fazer login. Tente novamente." |
| Role sem destino | usuário `admin`/desconhecido | tokens limpos; Banner `error` "Perfil de usuário não suportado neste aplicativo." | — |
| Aviso D5 | `consumeDiscardNotice` → `{count: N}` | Banner `warning` no topo do cartão, singular/plural atuais | `null` → sem Banner |
| Teclado abre/fecha | evento de teclado nativo | hero encolhe (só ícone + wordmark, altura reduzida) / volta | web não emite evento: hero fica cheio |

</frozen-after-approval>

## Code Map

- `mobile/src/app/(auth)/login.tsx` -- tela a redesenhar; toda a lógica de `handleLogin` e do efeito D5 fica como está (inclusive os comentários do porquê).
- `mobile/src/components/ui/primary-action.tsx` -- não aceita `id`; o Paper `Button` repassa `...rest` ao `Surface`, então um `id?: string` repassado ao `Button` vira o `id` do DOM no web. Adicionar só isso.
- `mobile/src/components/ui/banner.tsx` -- `Banner({ tone, message, testID })`; tons `error`/`warning` prontos, entra com slide 200ms. Reusar sem mudar.
- `mobile/src/components/ui/mdi-icon.tsx` -- `MdiIcon` para o `bus-school` 56dp (fica fora da árvore de acessibilidade; o wordmark carrega o sentido).
- `mobile/src/components/ui/sticky-action-bar.tsx:14-28` -- padrão de escuta do teclado (`keyboardWillShow`/`DidShow` por plataforma + `Keyboard.isVisible()` inicial); copiar o padrão, não o componente.
- `mobile/src/lib/palette.ts:130-156` -- `lightPalette.brand` (#f4d35e) e `onBrand` (ink). Telas existentes (`scan.tsx`, `student-list.tsx`) usam `lightPalette` no `StyleSheet`; seguir esse costume.
- `mobile/src/lib/tokens.ts` -- `typography.headline` (wordmark), `typography.body` (tagline), `spacing`, `radius.lg/xl`, `elevation.level1`, `motion`.
- `mobile/src/lib/theme.ts:71` -- fundo do `TextInput` outlined já corrigido no tema; não sobrescrever cor do input na tela.
- `mobile/src/login-screen.test.tsx` -- 3 testes do aviso D5 por texto; devem continuar verdes.
- `api/tests/support/helpers/e2e-driver.ts:21-55` -- e2e usa `#login-email`, `#login-password` e `getByRole('button', { name: 'Entrar' })`.

## Tasks & Acceptance

**Execution:**
- [x] `mobile/src/components/ui/primary-action.tsx` -- aceitar `id?: string` e repassá-lo ao `Button`; teste em `primary-action.test.tsx` -- preservar `#login-submit` sem contornar o componente.
- [x] `mobile/src/app/(auth)/login.tsx` -- layout novo: `KeyboardAvoidingView` + `ScrollView` sobre `surfaceSoft`; hero full-bleed `brand` (~38% da altura da janela, respeitando safe area do topo) com `bus-school` 56dp `onBrand`, "PureUrban" em `headline` e "Embarque sem carteirinha" em `body`; cartão `canvas` `level1` com gutter/`maxWidth` dos tokens contendo Banner D5 (`warning`), e-mail, senha, Banner de erro e `PrimaryAction` "Entrar" (`id="login-submit"`, `loading`); hero encolhe com o teclado (Reanimated, reduced motion); remover o subtítulo "Faça login para continuar" e o `StyleSheet` antigo -- AC da story 6.4.
- [x] `mobile/src/login-screen.test.tsx` -- manter os 3 testes; adicionar: erro de campo vazio renderiza Banner de erro com o texto atual e não chama `authService.login`; botão do olho alterna o rótulo "Mostrar senha"/"Ocultar senha"; wordmark e tagline presentes -- cobre a matriz sem device.

**Acceptance Criteria:**
- Given o app sem sessão, when abro no web a 390×844, then vejo o hero amarelo com ônibus, "PureUrban" e a tagline, e abaixo o cartão com e-mail, senha e "Entrar" de 56dp.
- Given os e2e existentes do Playwright, when rodam `loginAsDriver`/`loginAsStudent`, then passam sem alteração nos helpers.
- Given o device com o teclado aberto no campo de senha, when digito, then o hero está encolhido e "Entrar" continua visível acima do teclado.

## Review Triage Log

### Passe 1 (26/09/2026) — high 0 · medium 3 · low 14 · false 3 · maybe-false 1

| # | Lente | Achado | Veredito | Rota | Evidência / ação |
|---|---|---|---|---|---|
| 1 | edge-case | `hitSlop` 4 sobrescreve o default do IconButton (10/6) e encolhe o alvo do olho | medium | patch | `IconButton.tsx:200` confirma o default; remover `EYE_HIT_SLOP` |
| 2 | blind, edge-case | Alturas do hero ignoram `fontScale`; hero fixo com `overflow: hidden` corta wordmark/tagline | medium | patch | constantes usam `lineHeight` sem escala; escalar por `fontScale` |
| 3 | blind, verification-gap | Sem teste de toque duplo em "Entrar" durante o loading (guarda passou de `disabled` a `loading`) | medium | patch | nenhum teste segura a promessa pendente; adicionar |
| 4 | blind | Olho segue ativo com os campos desabilitados no loading | low | patch | `TextInput.Icon` sem `disabled`; correção direta |
| 5 | blind | Comentário "Normalize email…" restante repete o código | low | patch | regra do CLAUDE.md; deleção |
| 6 | verification-gap | Teste "Banner warning" não verifica o tom | low | patch | só checa testID; assertar `backgroundColor` |
| 7 | blind, verification-gap | Teste do teclado não verifica duração/reduced motion nem a altura | low | patch (duração) + defer (altura) | `expect.anything()` aceita qualquer duração; o mock do Reanimated não avalia estilo animado |
| 8 | blind | Sem teste do caminho de sucesso | low | patch | mock do `login` recriado a cada render; içar e testar |
| 9 | edge-case | Teste de perfil usa 'admin' (inválido só pela caixa) e não checa `router.replace` | low | patch | `ROLE_ROUTES` tem `ADMIN`; usar 'GUEST' |
| 10 | edge-case | Avisos de `act(...)` nos testes de submit | low | patch | 6 avisos na execução; aguardar o `finally` |
| 11 | edge-case, blind | Android: hero encolhe só no `keyboardDidShow` e soma com o KAV `height` (salto de layout) | maybe-false | defer | só verificável em device/emulador |
| 12 | blind | Sem `autoComplete`/`textContentType`/`returnKeyType` nos campos | low | defer | ausente antes da mudança; fora do restyle |
| 13 | edge-case | Leitor de tela anuncia "Entrar" habilitado durante o loading | low | defer | comportamento do `PrimaryAction` (6.2), não desta tela |
| 14 | edge-case | Janela baixa (paisagem) com tagline quebrada corta o hero | low | rejeitado | improvável no uso; exigiria medir via `onLayout` |
| 15 | edge-case | Mesmo erro repetido não reanuncia | low | rejeitado | pré-existente e raro; exige contador/key |
| 16 | blind | Teclado já aberto no mount / `remove` no unmount sem teste | low | rejeitado | padrão idêntico ao da `StickyActionBar`, coberto lá |
| 17 | blind | `jest.clearAllMocks` mantém implementações entre testes | low | rejeitado | cada teste que usa o mock define a própria; sem falha observada |
| 18 | blind | Ordem dos Banners no cartão não é assertada | low | rejeitado | JSX direto; teste de ordem seria frágil |
| 19 | blind | Usar `getByLabelText('Email')` em vez de `UNSAFE_getByProps` | false | rejeitado | testado: o rótulo do Paper não é achado por `getByLabelText` |
| 20 | intent | No web o hero não encolhe | false | rejeitado | previsto na matriz ("web não emite evento") |
| 21 | intent | Cores via `lightPalette`, não pelo tema | false | rejeitado | Code Map: costume das telas; tema escuro fora (D-UX-4) |

## Design Notes

**Encolher o hero:** estado `keyboardOpen` pelo mesmo padrão da `StickyActionBar`, dirigindo um `useSharedValue` (0 = cheio, 1 = compacto) com `withTiming(motion.standard)`; com reduced motion, `motion.reduced`. Compacto = altura menor e tagline oculta; ícone e wordmark ficam. Não usar `useAnimatedKeyboard` (comportamento irregular no web e no Android com `adjustResize`).

**Olho 48dp:** o `TextInput.Icon` do Paper renderiza um `IconButton` de 40dp e repassa `...rest` a ele; ampliar o alvo com `hitSlop` (4 por lado) em vez de aumentar o ícone.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte toda verde
- `cd mobile && npm run lint && npx tsc --noEmit` -- expected: 0 erros novos (3 já existentes: `scan.tsx:316`, `use-trip-gps-capture.test.tsx:92`, `tracking-stream.service.test.ts:172`)
- `grep -nE "#[0-9a-fA-F]{3,8}\b" "mobile/src/app/(auth)/login.tsx"` -- expected: vazio

**Manual checks:**
- Expo Web (390×844): capturas "depois" de login limpo, erro de campo vazio e aviso D5, comparadas com `audit/light-01-login.png` e `light-02-login-erro-vazio.png`; no DOM, `#login-email`, `#login-password`, `#login-submit` presentes.
- Um e2e de login (`npm run test:pw:e2e -- boarding-happy-path`) verde, se a infra local estiver de pé.
