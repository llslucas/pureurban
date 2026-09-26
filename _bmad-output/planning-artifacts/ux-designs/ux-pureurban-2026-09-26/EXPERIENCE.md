---
name: PureUrban Mobile
status: approved
updated: 2026-09-26
sources:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/1-11-revisao-da-paleta-de-cores.md
  - _bmad-output/implementation-artifacts/spec-1-11b-consumo-do-tema-escuro.md
design: DESIGN.md
---

# PureUrban Mobile — EXPERIENCE

> Proposta autônoma da UX (Sally), 26/09/2026, para o redesign visual + microinterações pré-defesa
> do TCC. **Fluxos e navegação não mudam** — exceto os pontos marcados **[DECISÃO D-UX-n]**, listados
> no fim. Tokens são referenciados como `{colors.x}` / `{typography.x}` do `DESIGN.md`. Este spine
> vence qualquer mock ou captura em caso de conflito.

## Foundation

- **Form-factor:** mobile único, Android primeiro (motorista e aluno), retrato. O alvo web (Expo
  Web, porta 8081) é usado na demo e nas capturas da monografia — o layout precisa funcionar em
  390×844 e aguentar desktop com coluna central (`maxWidth` 560).
- **Sistema de UI:** `react-native-paper` 5 (MD3). **Mantido** — já é usado em todas as telas, cobre
  Dialog/Snackbar/Banner/TextInput com acessibilidade, e os temas `lightTheme`/`darkTheme` em
  `lib/theme.ts` já derivam da paleta. Trocar de sistema a semanas da defesa seria risco sem ganho
  visível; o problema atual não é o Paper, é a falta de camada própria sobre ele. Este spine
  especifica só o delta comportamental.
- **Animação:** `react-native-reanimated` 4 (já instalado) + `react-native-svg` (instalado).
- **Háptico:** `expo-haptics` (novo, exige rebuild do dev build) com fallback `Vibration` do RN.
  **[DECISÃO D-UX-3]**
- **Tema:** claro travado (spec-1-11b) até decisão contrária. **[DECISÃO D-UX-4]**
- **Offline:** Tier 1 (leitura via cache TanStack/MMKV) e Tier 2 (fila SQLite de check-in) já
  existem; o redesign só dá forma visual consistente aos estados que eles produzem.

## Auditoria da UI atual

Execução real: **Expo Web + MSW** (`EXPO_PUBLIC_USE_MOCKS=1`, `EXPO_PUBLIC_E2E=1` para injetar
leituras de QR), Chromium via Playwright, viewport 390×844 @2x, claro e escuro do SO. 25 capturas em
[`audit/`](audit/). O painel admin não tem usuário mock — auditado pelo código. O `track-bus` caiu no
estado de erro no mock ([audit/light-32-track-bus.png](audit/light-32-track-bus.png)); o cartão do
ônibus foi auditado pelo código.

### Achados transversais

| # | Achado | Evidência |
|---|---|---|
| T1 | **Sem identidade de marca.** Login é "PureUrban" em negrito sobre cinza; sem logo, cor ou ícone. `app.json` ainda chama o app de `mobile` e usa o ícone padrão do template. | `light-01-login.png`, `app.json:3` |
| T2 | **Emoji e glifos como ícone.** `🚌 🔄 🟢 ✅` (trip), `🚌` (routes, qr), `⚠️ 🗺️` (routes), `✓ — !` (StudentCard). No Chromium sem fonte de emoji viram "tofu" (□); no Android variam por fabricante. | `light-11-trip-ativa.png`, `light-31-qr-code.png` |
| T3 | **Três fundos de tela diferentes:** `#f8fafc` (motorista), `#f2f2f2` do React Navigation (login, aluno), `#fffbfe` MD3 dentro dos TextInput (resíduo rosado do tema). | `light-01-login.png` vs `light-11-trip-ativa.png` |
| T4 | **Títulos duplicados:** header nativo "Viagem" + H1 "Gestão de Viagem"; "Minhas rotas" + "Minhas Rotas". Header é o default do React Navigation, peso regular, sem estilo. | `light-11`, `light-18-routes.png` |
| T5 | **Estados reimplementados por tela:** `Loading`/`Centered`/`Blocked` copiados em scan, student-list e track-bus com espaçamentos e tamanhos diferentes; routes usa emoji 56px. | código |
| T6 | **Escala tipográfica inexistente:** 9 `fontSize` distintos em 3 arquivos do motorista; 13 estilos usam `opacity` para hierarquia. | código |
| T7 | **Nenhuma saída de conta** para motorista e aluno — só o admin tem "Sair". Na demo, trocar de motorista para aluno exige limpar o storage. | `grep logout` |
| T8 | **Tema escuro não consumido:** com o SO em escuro, o app é idêntico ao claro (trava da 1.11b). Coerente, mas o `darkTheme` é código morto. | `dark-01-login.png`, `dark-10-…png` |
| T9 | **Zero háptico, zero animação.** Check-in, falha e ausência trocam de estado por corte seco. | código |
| T10 | Ação primária no meio da tela; terço inferior vazio nas telas do motorista (fora da zona do polegar). | `light-11-trip-ativa.png` |

### Achados por tela

| Tela | O que está errado | Evidência |
|---|---|---|
| `(auth)/login` | Sem marca (T1); fundo cinza de navegação (T3); inputs com tinte rosado MD3; botão "Entrar" com `rounded` 8 enquanto o resto usa 12; erro de validação em `HelperText` 12px vermelho; aviso de descarte da fila (D5) em `HelperText info` quase invisível. | `light-01`, `light-02-login-erro-vazio.png` |
| `(driver)/trip` | **Mostra o UUID da rota** ("Rota: 880e8400-e29b-…"); contagem "Alunos: 0/4" em texto corrido 15px — o número mais importante da tela é o menos visível; emoji-tofu no tipo de viagem e no chip; H1 duplicado; três botões grandes empilhados sem hierarquia de risco (Encerrar vermelho a 16px do Escanear, **sem confirmação**); horário com segundos ("13:14:21"). Estado sem viagem: um botão solto no topo, sem contexto de qual rota. | `light-11`, `light-23-trip-sem-viagem.png` |
| `(driver)/scan` | O ponto alto da demo e o melhor da app hoje (overlay full-screen por cor). Mas: sucesso **não diz quem embarcou** ("Aluno registrado nesta viagem"); contador é da *sessão* ("1 embarque nesta sessão"), não da viagem; "Ver lista" 44dp; ícone é caractere de texto (`✓`, `✕`) em 72px; auto-retomada de 2,5s sem indicação visual do tempo; sem háptico — o motorista precisa olhar a tela para saber o resultado. | `light-13` a `light-16` |
| `(driver)/student-list` | Boa base (chips com tinte, contagem do servidor). Falta: barra de progresso; distinção visual dos "Não vai voltar" (hoje só o chip); glifos `— !` como ícone; lista vazia é uma linha de texto solta no meio; "0/0 embarcados" no header da lista vazia; mudança em tempo real (SSE) só aparece como Snackbar — a linha muda de chip sem destaque. | `light-12`, `light-17`, `light-21`, `light-22` |
| `(driver)/routes` | **Inalcançável** — nenhuma tela navega até ela. Rótulos em CAIXA-ALTA, descrição em itálico alinhada à direita, emoji-tofu no nome. | `light-18-routes.png` |
| `(student)/home` | Conteúdo centralizado verticalmente como tela de login; "Meu QR Code" e "Acompanhar ônibus" **colados** (sem gap — estão num `<View>` sem `gap`); "Não vou voltar" com o mesmo peso visual de "Acompanhar"; não mostra o estado da viagem nem do embarque do aluno até algo acontecer; erro de registro de ausência cai num Snackbar genérico. | `light-30`, `light-34-ausencia-registrada.png` |
| `(student)/home` → Dialog | "Voltar" e "Confirmar" são text buttons idênticos (~40dp), ação primária indistinta. | `light-33-dialog-nao-vou-voltar.png` |
| `(student)/qr-code` | QR bem dimensionado e com quiet zone correta. Mas parece um cartão genérico: nome em fonte fina, "Rota" como título de seção com um divisor, emoji-tofu no nome da rota; nada remete a "passe de embarque". | `light-31`, `light-35-qr-sem-rota.png` |
| `(student)/track-bus` | O cartão principal mostra **latitude/longitude cruas** em `bodyLarge` como informação principal; a resposta que o aluno quer (distância/ETA) vem num segundo cartão; "Sem sinal GPS"/"Em tempo real" são chips outlined de mesmo peso. | código `track-bus.tsx:298-328` |
| `(admin)/home` | Placeholder: título + "Área reservada" + Sair centralizados. Fora do MVP (PRD). | código |
| Componentes | `OfflineBanner` é faixa cinza/vermelha sem ícone; `StudentCard` sem avatar; `qr-scanner` sem dica de uso. | código |

## Information Architecture

Inalterada. Grupos por papel (`ROLE_ROUTES`), Stack por grupo.

| Superfície | Chegada | Propósito | Prioridade |
|---|---|---|---|
| Login | App sem sessão | Autenticar | **P0** |
| Motorista › Viagem | Login (0 toques) | Estado da viagem, iniciar/encerrar, entrada para scan e lista | **P0** |
| Motorista › Escanear | Viagem (1 toque) | Registrar embarque por QR | **P0** |
| Motorista › Alunos da viagem | Viagem / Scan "Ver lista" | Quem embarcou, quem não vai voltar | **P0** |
| Motorista › Minhas rotas | *(sem entrada hoje)* | Rotas atribuídas | **P2** **[D-UX-6]** |
| Aluno › Início | Login (0 toques) | Status do dia, entradas para QR/rastreio, "Não vou voltar" | **P0** |
| Aluno › Meu QR Code | Início (1 toque) | Mostrar passe ao motorista | **P0** |
| Aluno › Acompanhar ônibus | Início (1 toque) | ETA/distância do ônibus | **P0** |
| Admin › Painel | Login | Placeholder fora do MVP | **P2** |
| Global: AppHeader overflow → Sair | Qualquer tela autenticada | Encerrar sessão | **P0** **[D-UX-5]** |

## Voice and Tone

Microcopy em português do Brasil, segunda pessoa ("você"), frases curtas e completas. A voz de
marca está no `DESIGN.md` → Brand & Style.

| Faça | Não faça |
|---|---|
| "Ana Souza embarcou" | "Aluno registrado nesta viagem." |
| "Já embarcou às 18:04" | "DUPLICATE_CHECK_IN" / "Erro ao registrar" |
| "Sem internet — embarque guardado. Envia sozinho quando a conexão voltar." | "Modo Offline — dados serão sincronizados (1 embarque na fila)" |
| "O ônibus está a 2,4 km — cerca de 8 min" | "-23.55012, -46.63310" |
| "Linha Centro – Universidade" | "Rota: 880e8400-…" |
| "Iniciada às 18:02" | "Início: 18:02:37" |
| Verbos no botão: "Escanear", "Encerrar viagem", "Avisar motorista" | "OK", "Confirmar" genérico em ação de impacto |
| Sentence case em tudo | CAIXA-ALTA, exclamações, emoji |

Horários sempre `HH:mm`. Números sempre com separador pt-BR ("2,4 km").

## Component Patterns

Comportamento. Visual em `DESIGN.md` → Components.

| Componente | Regras de comportamento |
|---|---|
| **AppHeader** | Configurado em `screenOptions` dos `_layout` de grupo. Back nativo. Overflow com "Sair" → ConfirmDialog se houver fila offline não enviada ("2 embarques ainda não foram enviados e serão descartados"), senão sai direto. **[D-UX-5]** |
| **Screen** | Aplica safe area, fundo, gutter e `maxWidth`. `scroll` usa `RefreshControl` quando a tela já tem pull-to-refresh hoje (routes, qr, student-list). |
| **PrimaryAction** | Um `primary` por tela. `loading` bloqueia toque duplo (mantém a guarda existente). Pressionar: escala 0,97 em 90ms (Reanimated), háptico leve **só** nas ações de impacto (Iniciar/Encerrar viagem, Não vou voltar). |
| **StickyActionBar** | Telas do motorista e do aluno com ação principal. Some quando o teclado abre. |
| **StatusChip** | Lê de um único mapa `STATUS_PRESENTATION` (já existe em `student-card.tsx`) — estendido com ícone MDI e `accessibilityLabel`. Transição de estado: cross-fade 200ms + pulso de fundo (ver Microinterações). |
| **BoardingCounter** | Fonte = `summary` do servidor (regra FR25 mantida); valor "—" enquanto indefinido (regra atual). Ao aumentar: número rola (+1) e a barra anima a largura em 400ms. |
| **TripCard** | Nome da rota vem do cache `['routes','mine']` (já buscado pela tela) casado por `routeId`; fallback "Rota atribuída" — nunca o UUID. |
| **StudentRow** | Não é tocável (sem ação hoje). `accessible` com rótulo "Ana Souza, embarcou às 18:04" (já existe). |
| **ScanHud** | Contador principal = embarcados/total da viagem (roster em cache, +1 otimista); linha secundária "3 nesta sessão". **[D-UX-8]** |
| **ScanResultOverlay** | Nome do aluno obtido do roster em cache pelo `studentId` do QR (funciona offline); se ausente, "Embarque confirmado". Sucesso e "enfileirado" auto-retomam após 2,5s (tempo atual) com barra regressiva visível; toque em qualquer lugar retoma antes. Falhas não auto-retomam (regra atual). |
| **QrPass** | Somente exibição. Pull-to-refresh da rota mantido. |
| **BusEtaCard** | Recalcula a cada evento SSE/posição. Chip "Ao vivo" vira "Sem sinal GPS há N min" pela regra de staleness existente. |
| **StateView** | Uma API: `kind: 'loading' | 'empty' | 'error' | 'blocked'`, `title`, `detail`, `action?`. Loading com > 400ms mostra Skeleton da tela quando a forma é conhecida; spinner só em boot. |
| **Banner** | Persistente enquanto a condição dura (regra atual do dado velho); ação "Atualizar". Entra deslizando 200ms. |
| **OfflineBanner** | Mesma posição e regras (D1/AC6 da 3.4b). Contador anima na mudança. |
| **ConfirmDialog** | Usado em: Não vou voltar (existente), Encerrar viagem **[D-UX-7]**, Sair com fila pendente. Ação confirmatória nomeada pelo verbo. |
| **CountdownPill** | Atualiza a cada 1s (regra atual); nos últimos 30s o texto passa a `status-not-returning` bold. |

## State Patterns

| Estado | Superfície | Tratamento |
|---|---|---|
| Boot | Raiz | Splash com marca (fundo `brand-yellow`, ícone) em vez do `ActivityIndicator` solto — se D-UX-1 aprovado; senão spinner sobre `surface-soft`. |
| Carregando (forma conhecida) | Trip, lista, QR, track-bus | Skeleton da forma final (TripCard; 6 StudentRows; QrPass; BusEtaCard). |
| Carregando (curto, < 400ms) | Qualquer | Nada — evita piscar. |
| Vazio — sem viagem | Trip | StateView `empty` com ícone `bus-clock`, "Nenhuma viagem em andamento", seletor de rota (se > 1) e **Iniciar viagem** na StickyActionBar. |
| Vazio — sem rota | Trip, Routes, QR | StateView `empty` `map-marker-off`, "Você ainda não tem rota. Fale com a administração." Sem botão desabilitado solto. |
| Vazio — turma sem alunos | Lista | StateView `empty` `account-group-outline`; contador oculto (hoje "0/0 embarcados"). |
| Vazio — aguardando viagem | Track-bus | StateView `empty` com ícone `bus-clock` e "Esta tela atualiza sozinha" + ponto pulsante indicando que está escutando. |
| Erro com retry | Todas | StateView `error` `cloud-alert`, título humano, PrimaryAction "Tentar novamente". |
| Erro com cache | Lista, track-bus | Conteúdo em cache + Banner `warning` "Pode estar desatualizado" + Atualizar (regra atual). |
| Bloqueado | Scan/lista (papel errado, viagem de outro motorista, sem viagem) | StateView `blocked` com a ação de saída que já existe ("Ir para Viagem", "Entrar novamente"). |
| Permissão | Scan (câmera), Trip (localização) | PermissionCard; negado permanente → "Abrir configurações" (regra atual). |
| Offline — escrita | Layout do motorista | OfflineBanner (fila) + overlay "Guardado sem internet" no scan. |
| Offline — leitura | Aluno | Banner `warning` no topo do Início quando a última atualização falhou. |
| Sucesso | Scan, ausência | Ver Microinterações. |

## Interaction Primitives

- Tocar para agir; nenhum gesto escondido é a única forma de acionar algo.
- Pull-to-refresh onde já existe (routes, qr, student-list) — mantido.
- Voltar nativo (header e gesto/botão do sistema).
- Toque em qualquer lugar do overlay de **sucesso** do scan retoma a leitura (atalho; o botão
  continua).
- **Banidos:** swipe-to-action, long-press com função, carrossel, animações de entrada decorativas
  em listas, badge de notificação, sons automáticos.

## Microinterações

Todas via Reanimated (worklets, thread de UI). Todas respeitam **Reduzir movimento**
(`useReducedMotion()` do Reanimated): com ele ligado, troca por cross-fade de 120ms ou corte seco, e
o háptico permanece (não é movimento).

| Momento | Movimento | Háptico | Duração |
|---|---|---|---|
| **Check-in confirmado** (clímax da demo) | Overlay verde entra com fade + escala 0,96→1; círculo branco do ícone expande (spring); o `check-bold` é desenhado por traço SVG (`strokeDashoffset`); nome do aluno sobe 8dp com fade; barra regressiva de 2,5s no topo esvazia linearmente | `notificationAsync(Success)` · fallback `Vibration.vibrate(40)` | 180ms entrada, 300ms traço |
| Contador após check-in | Número rola +1 (translateY), barra de progresso cresce | — | 400ms |
| Já embarcou (âmbar) | Ícone `alert` com leve balanço (rotate ±6°, 2 ciclos) | `notificationAsync(Warning)` · fallback `[0,30,60,30]` | 300ms |
| Falha / QR inválido (vermelho) | Bloco central treme horizontalmente (±8dp, 3 ciclos) | `notificationAsync(Error)` · fallback `[0,60,80,60]` | 240ms |
| Guardado offline (cinza) | Ícone `cloud-upload-outline` com seta subindo em loop 1× | `impactAsync(Light)` | 400ms |
| Scanner ocioso | Linha de varredura desce e sobe dentro da janela | — | 1,8s loop, pausa quando `isPaused` |
| Linha da lista muda por SSE | Fundo da linha pulsa no tinte do novo status e volta; chip faz cross-fade | — | 600ms |
| "Não vou voltar" confirmado | Cartão de status troca com cross-fade; CountdownPill entra | `notificationAsync(Success)` | 250ms |
| Pressionar ação | Escala 0,97 | `selectionAsync()` só em ações de impacto | 90ms |
| Banner/Snackbar | Desliza 12dp + fade | — | 200ms |
| Skeleton | Shimmer esquerda→direita | — | 1,2s loop |
| "Ao vivo" (track-bus) | Ponto verde pulsa (escala 1→1,6, opacidade 0,6→0) | — | 1,6s loop |

Som: nenhum no escopo. Um "bip" de confirmação no scan é candidato P2 (exige `expo-audio`).

## Accessibility Floor

Comportamental. Contraste visual no `DESIGN.md`.

- **Alvos:** 48dp mínimo em tudo que é tocável (corrige "Ver lista" 44dp e as ações de Dialog
  ~40dp); ações primárias 56dp. `hitSlop` para ícones de header.
- **Contraste sob sol:** texto ≥ 4.5:1 (AA) em todo corpo; o âmbar (4.24:1) só em texto grande/bold
  ou com ícone (D3 da 1.11). Nada de `opacity` em texto. Telas do motorista com corpo ≥ 17sp.
- **Status nunca só por cor:** ícone + rótulo em chip, overlay e banner. Overlays do scan também
  diferem por **ícone e padrão háptico**, para daltônicos e para quem não está olhando.
- **Font scaling:** `allowFontScaling` ligado; layout testado em fontScale 1.0 / 1.3 / 2.0. Até 1.3
  nada trunca; em 2.0 o TripCard empilha (chip abaixo do título), StudentRow quebra o nome em 2
  linhas e o chip vai para baixo. `display-count` usa `maxFontSizeMultiplier` 1.5 para não estourar.
- **Leitores de tela:** overlay do scan com `accessibilityLiveRegion="assertive"` e anúncio
  "Ana Souza embarcou" / "QR code inválido"; OfflineBanner mantém `polite`; CountdownPill anuncia a
  cada minuto, não a cada segundo; ícones decorativos `importantForAccessibility="no"`.
- **Reduzir movimento:** ver Microinterações.
- **Uma mão:** ação principal no terço inferior; nada crítico no canto superior esquerdo além do
  voltar.
- **Toques (NFR19):** check-in e "Não vou voltar" continuam em ≤ 2 toques — nenhuma confirmação nova
  entra nesses caminhos.

## Especificação de redesign por tela

Prioridade: **P0** = aparece na demo da banca e/ou nas capturas da monografia; **P1** = estados
secundários e polimento; **P2** = fora do caminho da demo.

### Fundação — P0 (bloqueia todas as telas)
1. `lib/tokens.ts` (spacing, radius, tipografia) + papéis de status em `lib/palette.ts` (guarda de
   paleta atualizada; nenhum hex novo exceto a adoção D7 se aprovada).
2. `lib/theme.ts`: `configureFonts` com a escala, `background`/`surface` → `surface-soft`/`canvas`
   (mata o `#fffbfe` e o `#f2f2f2`), tema de navegação do React Navigation alinhado.
3. `components/ui/`: Screen, PrimaryAction, StickyActionBar, StatusChip, StateView, Skeleton,
   Banner, ConfirmDialog; `screenOptions` do AppHeader nos `_layout`.
4. `app.json`: nome "PureUrban", ícone e splash de marca.

### Login — P0
Hero `brand-yellow` ocupando ~38% superior com ícone `bus-school` 56dp e wordmark "PureUrban"
`headline` + tagline `body` "Embarque sem carteirinha" (D-UX-1; sem aprovação, hero `canvas` com o
mesmo conteúdo). Abaixo, cartão com e-mail, senha (olho 48dp) e **Entrar** 56dp. Erro de validação
em Banner `error` inline acima do botão; aviso de descarte (D5) em Banner `warning` no topo do
formulário. Teclado: formulário sobe, hero encolhe.

### Motorista › Viagem — P0
- **Ativa:** TripCard herói (overline tipo de viagem, nome da rota, StatusChip "Em andamento",
  BoardingCounter grande, "Iniciada às 18:02"). Abaixo, PermissionCard se faltar localização. Linha
  secundária "Ver alunos da viagem" como item de lista tocável 56dp com chevron.
  StickyActionBar: **Escanear QR** (primary, ícone `qrcode-scan`) e, acima dela, **Encerrar
  viagem** como `secondary` com texto/ícone vermelho — sai da posição de destaque e ganha
  ConfirmDialog **[D-UX-7]**.
- **Sem viagem:** StateView `empty` + seletor de rota (SegmentedButtons restilizados como lista de
  opções com rádio 56dp se > 1 rota) + **Iniciar viagem** na StickyActionBar.
- **Ida concluída:** TripCard com chip "Concluída" e contagem final; StickyActionBar **Iniciar
  retorno** (`replay`).
- Remove o H1 "Gestão de Viagem".

### Motorista › Escanear — P0 (clímax da demo)
ScanHud ("12/32 embarcados" + "Ver lista" 48dp) sobre a câmera; ScanFrame com linha de varredura e
dica; ScanResultOverlay com nome do aluno, ícone desenhado, háptico e barra regressiva. Tons e
códigos da Tabela de Verdade da 3.3b inalterados — só a apresentação muda. Estados bloqueados via
StateView.

### Motorista › Alunos da viagem — P0
Cabeçalho fixo com BoardingCounter + mini-legenda ("20 embarcaram · 3 não vão voltar · 37
aguardando"). Lista com StudentRow (avatar de iniciais, StatusChip com ícone). Ordem do servidor
mantida. Pulso de linha em mudança por SSE + Snackbar atual. Banner de dado velho restilizado.
Vazio via StateView.

### Aluno › Início — P0
De "tela de login com botões" para **painel do dia**: saudação "Olá, Ana" `title-lg` alinhada à
esquerda; cartão de status da viagem (StatusChip do aluno: aguardando / embarcou / não vai voltar,
com hora); dois atalhos grandes lado a lado em grade 2×1 (cartões tocáveis 112dp: **Meu QR** com
`qrcode`, **Onde está o ônibus** com `bus-marker`); lembrete "E a volta?" como Banner `warning`
destacado quando existe; **Não vou voltar** como `secondary` na StickyActionBar (não compete com o
QR). Ausência registrada: cartão com CountdownPill e "Desfazer" `secondary`. Dialog com ação
"Avisar motorista" `contained` e "Voltar" `quiet`.

### Aluno › Meu QR Code — P0
QrPass centralizado: faixa amarela com `bus-school`, nome e rota; QR (tamanho atual, quiet zone
intacta); rodapé "Mostre ao motorista". Estados de rota (carregando/erro/sem rota) viram linha
discreta dentro da faixa. Sessão inválida via StateView `blocked`.

### Aluno › Acompanhar ônibus — P0
BusEtaCard herói ("~8 min", "2,4 km de você", chip "Ao vivo"/"Sem sinal GPS há 3 min"); abaixo,
"Última posição às 21:04 · precisão ~15 m" em `caption`. Coordenadas brutas removidas do herói
(ficam só no rótulo de acessibilidade ou somem). Aguardando/sem viagem/erro via StateView;
permissão de localização do aluno negada → PermissionCard em vez de texto solto.

### P1
OfflineBanner restilizado; Skeletons de todas as telas P0; PermissionCards; `+not-found`; tela de
erro de mocks (dev-only, só alinhar tokens).

### P2
Minhas rotas (restyle com RouteCard: nome `title`, "Centro → Campus Universitário" com ícone
`arrow-right`, descrição `body` sem itálico) — e entrada **[D-UX-6]**; Painel admin (StateView
"Em breve" com marca); consumo do tema escuro **[D-UX-4]**; brilho máximo automático no QR
(`expo-brightness`, nativo) **[D-UX-10]**; bip de scan.

## Key Flows

Nomes das personas do PRD. O mock usa "Carlos Ferreira"/"Ana Souza" — na demo, vale renomear os
dados de seed para bater com as jornadas.

### Flow 1 — Embarque na ida (Seu João, 17h40, sol baixo no para-brisa, 38 alunos)
1. João abre o app; cai em **Viagem** (0 toques). Vê a rota pelo nome, "Nenhuma viagem em
   andamento".
2. Toca **Iniciar viagem** no rodapé (polegar). Háptico leve; TripCard entra com "Em andamento" e
   "0/38".
3. Toca **Escanear QR**. Câmera abre com a linha de varredura e "Aponte para o QR do aluno".
4. Carlos estende o celular. O QR é lido.
5. **Clímax:** a tela inteira fica verde, o check se desenha, "**Carlos Souza embarcou**" aparece
   em letras grandes e o celular vibra na mão de João — ele sabe que deu certo **sem olhar**. O
   contador no topo vai de 11 para **12/38**. Em 2,5s a câmera volta sozinha, a barra no topo
   mostrando o tempo.
6. Um aluno mostra o QR de novo: âmbar, balanço, vibração dupla — "Já embarcou às 17:43".

Falha: sem internet → cinza "Guardado sem internet — envia sozinho" + vibração curta; OfflineBanner
no rodapé com o contador da fila.

### Flow 2 — Partida da volta (Seu João, 22h10, estacionamento da faculdade)
1. João toca **Iniciar retorno**.
2. Abre **Alunos da viagem**. Cabeçalho: "30/32 embarcados · 2 não vão voltar".
3. Enquanto olha, Ana avisa pelo app: a linha dela pulsa em âmbar e vira "Não vai voltar"; Snackbar
   "Ana Souza não vai voltar no ônibus".
4. **Clímax:** a barra de progresso fica cheia — todos os esperados estão a bordo. João toca
   **Encerrar viagem**, confirma, e parte no horário.

### Flow 3 — "Onde está o ônibus?" (Carlos, 17h25, no portão de casa)
1. Carlos abre o app; **Início** mostra "Viagem de ida em andamento" e seu status "Aguardando".
2. Toca **Onde está o ônibus**.
3. **Clímax:** "**~8 min**" em número grande, "2,4 km de você", ponto verde "Ao vivo" pulsando.
   Carlos termina o café.
4. Na chegada, volta ao Início, toca **Meu QR** e mostra o passe amarelo ao motorista.

### Flow 4 — "Não vou voltar" (Ana, 21h50, saindo de carona)
1. Ana abre o app; o Banner "E a volta?" está no topo do Início.
2. Toca **Não vou voltar**; o Dialog pergunta; ela toca **Avisar motorista** (2 toques — NFR19).
3. **Clímax:** háptico de sucesso; o cartão vira "Motorista avisado" com a pílula "Desfazer em
   4:59" correndo.
Falha: rede → Snackbar com "Tentar novamente"; o dialog fecha sem perder a intenção.

## Inspiration & Anti-patterns

- **Tomado de cartões de embarque de companhias aéreas:** o QR como "passe" com faixa de cor da
  marca e nome grande — o aluno reconhece a função sem ler.
- **Tomado de apps de logística/entrega (painel de motorista):** contagem como herói, ação primária
  no rodapé, feedback háptico por resultado.
- **Tomado de apps de transporte (ETA):** tempo estimado como número principal, "ao vivo" como
  ponto pulsante discreto.
- **Rejeitado — mapa cartográfico no track-bus:** fora do MVP (FR32); não simular com imagem.
- **Rejeitado — ilustrações/mascote:** custo alto, envelhece mal, compete com o status.
- **Rejeitado — gamificação** (streak de embarque, badges): o produto é operacional.
- **Rejeitado — tema escuro "porque é bonito" na demo:** perde legibilidade no projetor e sob sol.

## Decisões que precisam de aprovação

| ID | Decisão | Recomendação | Alternativa | Impacto se recusada |
|---|---|---|---|---|
| **D-UX-1** | Adotar `signature-yellow #f4d35e` (D7 da 1.11) como cor de marca **só full-bleed** (hero do login, faixa do QrPass, splash, ícone) | Adotar — dá identidade sem tocar em status | Manter só tinta/branco | Login e QR ficam sóbrios; o app segue "genérico" para a banca |
| **D-UX-2** | Fonte Inter via `@expo-google-fonts/inter` (dependência nova, JS-only) | Adotar | Fonte do sistema com a mesma escala | Perde parte do ganho de acabamento, sobretudo no web |
| **D-UX-3** | Háptico com `expo-haptics` (módulo nativo — exige novo dev build/EAS) | Adotar se houver tempo de rebuild; senão fallback `Vibration` do RN (sem rebuild) | Só `Vibration` | Padrões menos refinados; no web não há háptico em nenhum caso |
| **D-UX-4** | Manter a trava de tema claro até a defesa | Manter | Implementar consumo do `darkTheme` (exige variantes on-dark de status = cores novas) | — |
| **D-UX-5** | "Sair" no overflow do header para motorista e aluno (hoje não existe) | Adotar — é necessário para trocar de conta na demo | Manter sem saída | Demo exige limpar storage para trocar de papel |
| **D-UX-6** | Entrada para "Minhas rotas" (hoje órfã) — ex.: item no overflow do header do motorista | Adotar como P2 | Deixar órfã ou remover a tela | Nenhum na demo |
| **D-UX-7** | ConfirmDialog em "Encerrar viagem" | Adotar (ação irreversível a 16px do Escanear) | Sem confirmação | Risco de encerrar por engano ao vivo |
| **D-UX-8** | Contador do scan passa a ser da viagem (X/Y, do roster em cache) com a sessão em segundo plano | Adotar | Manter "N nesta sessão" | Motorista precisa ir à lista para saber quantos faltam |
| **D-UX-9** | Âmbar: resolver o contraste do overlay com tipo grande (≥ 24/20px bold) em vez de criar um âmbar escuro novo | Tipo grande | Novo token `warning-strong` | — |
| **D-UX-10** | Brilho máximo no QR (`expo-brightness`, nativo) | P2, pós-defesa | — | — |
| **D-UX-11** | Nome/ícone/splash do app (`app.json` "mobile" → "PureUrban") | Adotar | — | Launcher mostra "mobile" na demo |
| **D-UX-12** | Correção do brief: âmbar = "não vai voltar", pendente = neutro (como no código). Confirmar | Seguir o código | Âmbar para pendente | Âmbar em 90% das linhas no início da viagem diluiria o sinal de ausência |
| **D-UX-13** | Versionar as capturas "antes" (`audit/`, 1,5 MB) no repositório para a monografia | Versionar | Manter só local | Perde o "antes/depois" da monografia |

### Registro de aprovação (26/09/2026)

Decisões tomadas pelo usuário (D-UX-1 a 5, 7 e 11) e pelo PM (demais), antes do fatiamento do Épico 6:

| ID | Veredito |
|---|---|
| D-UX-1 | **Aprovada** — amarelo-escolar full-bleed |
| D-UX-2 | **Aprovada** — Inter |
| D-UX-3 | **Aprovada** — `expo-haptics`; todas as deps nativas numa única rebuild, na story de fundação |
| D-UX-4 | **Aprovada** — só tema claro até a defesa; tema escuro vira story opcional P2 |
| D-UX-5 | **Aprovada** — "Sair" para motorista e aluno (exceção de fluxo) |
| D-UX-6 | **Recusada** — "Minhas rotas" continua sem entrada; só o restyle P2 fica no épico |
| D-UX-7 | **Aprovada** — ConfirmDialog em "Encerrar viagem" (exceção de fluxo; atualiza o e2e) |
| D-UX-8 | **Aprovada (PM)** — contador X/Y da viagem |
| D-UX-9 | **Aprovada (PM)** — tipo grande, sem token novo |
| D-UX-10 | **Adiada (PM)** — pós-defesa |
| D-UX-11 | **Aprovada** — nome "PureUrban", ícone e splash |
| D-UX-12 | **Aprovada (PM)** — segue o código |
| D-UX-13 | **Aprovada (PM)** — capturas versionadas |
