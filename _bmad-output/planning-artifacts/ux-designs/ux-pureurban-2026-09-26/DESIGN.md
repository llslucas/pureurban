---
name: PureUrban Mobile
description: Painel de bordo para o embarque universitário — tinta sobre branco, status que se lê de relance sob o sol, e uma única nota de amarelo-escolar nas superfícies de marca.
status: approved
updated: 2026-09-26
sources:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/implementation-artifacts/1-11-revisao-da-paleta-de-cores.md
  - _bmad-output/implementation-artifacts/spec-1-11b-consumo-do-tema-escuro.md
  - DESIGN.md (raiz — análise Airtable, fonte dos tokens de cor da Story 1.11)
colors:
  # Marca e ação (Story 1.11, D1 — inalterados)
  primary: '#181d26'
  primary-active: '#0d1218'
  on-primary: '#ffffff'
  # Texto
  ink: '#181d26'
  body: '#333840'
  muted: '#41454d'
  # Superfícies
  canvas: '#ffffff'
  surface-soft: '#f8fafc'
  surface-strong: '#e0e2e6'
  hairline: '#dddddd'
  border-strong: '#9297a0'
  # Status de embarque (papéis semânticos — valores da Story 1.11)
  status-boarded: '#006400'
  status-boarded-tint: '#e0ece0'
  status-pending: '#333840'
  status-pending-tint: '#e7e7e8'
  status-not-returning: '#b26a00'
  status-not-returning-tint: '#f6ede0'
  status-error: '#b3261e'
  status-error-tint: '#f6e5e4'
  status-info: '#254fad'
  status-info-tint: '#e5eaf5'
  # Superfície-assinatura (D7 da 1.11 — PROPOSTA de adoção, ver Decisões)
  brand-yellow: '#f4d35e'
  on-brand-yellow: '#181d26'
  # Câmera (allowlist da guarda de paleta — não são cores de UI)
  camera-black: '#000000'
  qr-quiet-zone: '#ffffff'
  # Mapeamento escuro (D6 da 1.11 — consumido desde a Story 6.14, D-UX-4)
  canvas-dark: '#181d26'
  surface-dark: '#1d1f25'
  ink-dark: '#ffffff'
  body-dark: '#dddddd'
  hairline-dark: '#41454d'
  primary-dark: '#ffffff'
  on-primary-dark: '#181d26'
typography:
  display-count:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.5px
    note: 'Contagem de embarque e ETA; sempre tabular-nums'
  headline:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.25px
  title-lg:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.27
  title:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.33
  body-lg:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.41
    note: 'Corpo padrão das telas do motorista'
  body:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.47
  label:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.33
    note: 'Chips de status, rótulos de campo'
  button:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.3
  caption:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.38
    note: 'Piso absoluto. Proibido nas telas do motorista em movimento (trip, scan, student-list)'
  overline:
    fontFamily: 'Inter, system-ui, Roboto, sans-serif'
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: 0.8px
    note: 'Caixa-alta; só rótulos de seção, nunca informação'
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  gutter: 16px
  section-gap: 24px
  touch-min: 48px
  action-height: 56px
components:
  app-header:
    background: '{colors.canvas}'
    title: '{typography.title}'
    titleColor: '{colors.ink}'
    divider: '{colors.hairline}'
    height: 56px
  screen:
    background: '{colors.surface-soft}'
    padding: '{spacing.gutter}'
  primary-action:
    background: '{colors.primary}'
    text: '{colors.on-primary}'
    typography: '{typography.button}'
    height: '{spacing.action-height}'
    rounded: '{rounded.md}'
  secondary-action:
    background: '{colors.canvas}'
    text: '{colors.ink}'
    border: '{colors.border-strong}'
    height: '{spacing.action-height}'
    rounded: '{rounded.md}'
  danger-action:
    background: '{colors.status-error}'
    text: '{colors.on-primary}'
    height: '{spacing.action-height}'
    rounded: '{rounded.md}'
  status-chip-boarded:
    background: '{colors.status-boarded-tint}'
    text: '{colors.status-boarded}'
    icon: check-circle
    rounded: '{rounded.full}'
    typography: '{typography.label}'
    height: 32px
  status-chip-pending:
    background: '{colors.status-pending-tint}'
    text: '{colors.status-pending}'
    icon: clock-outline
    rounded: '{rounded.full}'
  status-chip-not-returning:
    background: '{colors.status-not-returning-tint}'
    text: '{colors.status-not-returning}'
    icon: account-cancel
    rounded: '{rounded.full}'
  card:
    background: '{colors.canvas}'
    border: '{colors.hairline}'
    rounded: '{rounded.lg}'
    padding: '{spacing.4}'
  boarding-counter:
    value: '{typography.display-count}'
    track: '{colors.surface-strong}'
    fill: '{colors.status-boarded}'
    barHeight: 8px
    rounded: '{rounded.full}'
  scan-overlay-success:
    background: '{colors.status-boarded}'
    text: '{colors.on-primary}'
  scan-overlay-warning:
    background: '{colors.status-not-returning}'
    text: '{colors.on-primary}'
    minTitle: 24px
    minDetail: 20px
  scan-overlay-error:
    background: '{colors.status-error}'
    text: '{colors.on-primary}'
  scan-overlay-offline:
    background: '{colors.body}'
    text: '{colors.on-primary}'
  qr-pass:
    header: '{colors.brand-yellow}'
    headerText: '{colors.on-brand-yellow}'
    body: '{colors.qr-quiet-zone}'
    rounded: '{rounded.xl}'
  banner-warning:
    background: '{colors.status-not-returning-tint}'
    text: '{colors.ink}'
    icon: '{colors.status-not-returning}'
  banner-offline:
    background: '{colors.body}'
    text: '{colors.on-primary}'
  banner-error:
    background: '{colors.status-error}'
    text: '{colors.on-primary}'
---

# PureUrban Mobile — DESIGN

> Proposta autônoma da UX (Sally), 26/09/2026. Tudo o que depende de aprovação está marcado
> **[DECISÃO D-UX-n]** e consolidado em `EXPERIENCE.md` → *Decisões que precisam de aprovação*.
> Este documento vence qualquer mock ou captura em caso de conflito. As capturas "antes" estão em
> [`audit/`](audit/) — prefixo `light-` (claro) e `dark-` (SO em escuro; na auditoria o app travava em claro — o
> consumo do escuro entrou na Story 6.14, ver `after/dark-*`).

## Brand & Style

O PureUrban é uma ferramenta de trabalho de campo, não um app de consumo: o motorista usa em pé,
com uma mão, sob sol de fim de tarde ou na penumbra do ônibus às 22h; o aluno abre por dez segundos
para mostrar o QR ou ver quanto falta. A direção visual é **"painel de bordo"** — tinta quase-preta
sobre branco, números grandes, status que se lê de relance a um braço de distância, e nada que não
carregue informação.

A base herdada da Story 1.11 (paleta sóbria derivada do DESIGN.md da raiz, primário tinta
`#181d26`) está correta para esse posicionamento e **não muda**. O que falta hoje é *identidade* e
*sistema*: o app não tem marca visível (o login é a palavra "PureUrban" em negrito sobre cinza), usa
emoji como ícone, e cada tela reinventa título, espaçamento e estados. A proposta resolve isso com:

1. **Uma nota de marca:** o amarelo-escolar `{colors.brand-yellow}` (`#f4d35e`, já registrado como
   `signature-yellow` na D7 da 1.11), usado **apenas full-bleed** — hero do login, cabeçalho do passe
   QR do aluno, splash e ícone. Remete ao ônibus escolar sem cair no clichê infantil, e respeita o
   guard-rail da fonte ("full-bleed apenas, nunca acento pequeno"). **[DECISÃO D-UX-1]**
2. **Tipografia com personalidade contida:** Inter no lugar do Roboto/DejaVu padrão, com escala
   maior que o default MD3 nas telas do motorista. **[DECISÃO D-UX-2]**
3. **Um vocabulário de componentes único** (seção Components) que substitui os `Loading`,
   `Centered` e `Blocked` hoje triplicados em `scan.tsx`, `student-list.tsx` e `track-bus.tsx`.

Postura: confiável, direta, sem enfeite. O "uau" da banca vem da **clareza e do feedback físico do
check-in** (overlay, háptico, contador que anda), não de gradientes ou ilustração.

## Colors

A paleta é a da Story 1.11 com papéis nomeados para status. Nenhum hex de papel semântico novo é
introduzido; os tintes (`*-tint`) são o equivalente opaco sobre branco do `withAlpha(cor, 0.12)` que
`lib/palette.ts` já calcula — o código continua derivando por alpha, os hex aqui só documentam.

- **Tinta (`{colors.primary}` / `{colors.ink}`)** — ação primária, títulos, ícones ativos. "Preto é o
  primário." Texto branco sobre tinta: ~17:1.
- **Body `#333840` / Muted `#41454d`** — corpo e legendas. Ambos ≥ 9:1 sobre branco. **Regra nova:**
  hierarquia de texto se faz com esses tokens, **nunca com `opacity`** — hoje 13 estilos usam
  `opacity: 0.6–0.75` (login, home do aluno, QR, track-bus, scan), o que produz cinzas
  imprevisíveis e derruba contraste sob sol.
- **Superfícies** — `{colors.surface-soft}` é o fundo de TODA tela (hoje há três fundos: `#f8fafc`
  no motorista, `#f2f2f2` do React Navigation no login/aluno, e `#fffbfe` MD3 dentro dos TextInput —
  ver [audit/light-01-login.png](audit/light-01-login.png)). `{colors.canvas}` é cartão e header.
- **Status de embarque** — o coração do app. Três estados, cada um com cor + ícone + rótulo
  (nunca só cor):
  - `status-boarded` verde `#006400` → **Embarcou** (7.4:1 sobre branco).
  - `status-pending` neutro `#333840` → **Não embarcou / aguardando**. Neutro de propósito: a
    ausência de check-in é o estado normal no início da viagem e não deve gritar.
  - `status-not-returning` âmbar `#b26a00` → **Não vai voltar**. 4.24:1 sobre branco — válido só como
    texto ≥ 18.66px bold ou componente (piso 3:1, decisão D3 da 1.11). Por isso o chip usa `label`
    600 com ícone, e o overlay âmbar do scan exige título ≥ 24px e detalhe ≥ 20px bold.
  - `status-error` vermelho `#b3261e` → único vermelho; falhas e ação destrutiva (Encerrar viagem).
  - `status-info` azul `#254fad` → viagem concluída, informativo.
- **Brand yellow `#f4d35e`** — só full-bleed, sempre com texto `{colors.ink}` (11.5:1). Nunca em
  texto, borda, ícone ou chip. Nunca na tela do motorista em operação (compete com o âmbar de status).
- **Câmera** — preto puro e branco da quiet zone seguem na allowlist da guarda; não são cores de UI.
- **Escuro** — desde a Story 6.14 o app segue o esquema do SO (sem toggle próprio) e consome o
  mapeamento D6 (`*-dark`). Os papéis de status/link/info ganharam variantes on-dark, todas
  ≥ 4.5:1 sobre o canvas e o surface escuros, reusando tokens registrados: embarcou/sucesso =
  `successBorder` `#39bf45`, info/link = `infoBorder` `#458fff`, não vai voltar = mostarda
  `#d9a441` (7.5:1 — no escuro o âmbar sai do piso 3:1 da D3). O único hex novo é o erro on-dark
  `#f2b8b5` (baseline MD3 dark), porque nenhum token registrado é um vermelho legível no escuro.
  Tintes de chip = 12% da variante on-dark. Chrome de câmera (scan) e passe do QR não mudam com
  o esquema: sobre o feed, um overlay branco à noite ofuscaria, e o QR precisa da quiet zone
  branca. **[DECISÃO D-UX-4 — entregue na 6.14]**

## Typography

**Família:** Inter (400/600/700) carregada por `expo-font` + `@expo-google-fonts/inter`, com fallback
`system-ui`/Roboto. Inter tem números tabulares nativos e desenho mais firme em tamanhos pequenos que
o Roboto — e o DejaVu que o web cai hoje é o principal responsável pelo ar "amador" nas capturas.
Se D-UX-2 for recusada, a escala abaixo vale igual sobre a fonte do sistema.

**Implementação:** a escala entra no `PaperProvider` via `configureFonts` (MD3), mapeando
`displaySmall→display-count`, `headlineMedium→headline`, `titleLarge→title-lg`,
`titleMedium→title`, `bodyLarge→body-lg`, `bodyMedium→body`, `labelLarge→label/button`,
`bodySmall→caption`. Telas passam a usar `variant=` do Paper em vez de `fontSize` avulso (hoje há 9
tamanhos distintos só em `trip.tsx` + `scan.tsx` + `routes.tsx`: 13, 14, 15, 16, 17, 18, 28, 56, 72).

| Papel | Uso | Regra |
|---|---|---|
| `display-count` | "28/32 embarcados", ETA "8 min" | `fontVariant: tabular-nums`; o número é o herói da tela |
| `headline` | Título de estado vazio/erro, título do overlay do scan | Máx. 1 por tela |
| `title-lg` | Nome da rota no TripCard, nome no passe QR | — |
| `title` | Header, títulos de cartão, nome do aluno na lista | — |
| `body-lg` | Corpo nas telas do motorista | Piso do motorista |
| `body` | Corpo nas telas do aluno | — |
| `label` / `button` | Chips, botões | Sentence case; nada de CAIXA-ALTA em botão |
| `caption` | Hora do check-in, "Posição de 21:04" | Nunca nas telas do motorista para informação crítica |

Font scaling: todos os tamanhos em `sp` (padrão RN) e `allowFontScaling` ligado; o layout precisa
aguentar **fontScale 1.3** sem truncar ação — ver EXPERIENCE.md → Acessibilidade.

## Layout & Spacing

Grade de 4pt: 4 / 8 / 12 / 16 / 24 / 32 / 48. `{spacing.gutter}` (16) é a margem lateral de TODAS as
telas — hoje varia entre 16, 20 e 24, com `paddingTop: 40` avulso em trip/routes empurrando o
conteúdo para baixo de um header que já existe.

- **Zona do polegar:** nas telas do motorista a ação primária fica numa **barra de ação inferior
  fixa** (`StickyActionBar`), não no meio do scroll. Em `trip.tsx` hoje os três botões ficam no terço
  médio e o terço inferior é vazio ([audit/light-11-trip-ativa.png](audit/light-11-trip-ativa.png)).
- **Hierarquia vertical:** herói (status/contagem) → contexto (cartão) → ações. `section-gap` 24
  entre blocos; 8–12 dentro de um bloco.
- **Largura:** coluna única, conteúdo com `maxWidth: 560` centralizado (web/tablet da demo).
- **Alvos:** `{spacing.touch-min}` 48dp mínimo; ação primária `{spacing.action-height}` 56dp.

## Elevation & Depth

Sombra é ruído sob sol e some em tela de brilho baixo. A profundidade vem de **tom e borda**:

- **Nível 0** — `surface-soft`: fundo da tela.
- **Nível 1** — `canvas` + borda `hairline` 1px: cartões, linhas de lista, header. Substitui o
  `Card mode="elevated"` + `elevation: 2` usado hoje em trip/routes/qr/track-bus.
- **Nível 2** — sombra curta (y 2, blur 8, 12% tinta) **só para o que flutua**: StickyActionBar,
  Snackbar, Dialog.
- **Nível 3** — overlay full-screen do scan: sem sombra, cor chapada ocupa a tela inteira.

Os níveis `elevation.level1–5` do tema Paper continuam mapeados para tons da paleta (1.11b).

## Shapes

- `{rounded.sm}` 8 — chips retangulares residuais, skeleton de texto.
- `{rounded.md}` 12 — botões, inputs, banners. (Hoje: 8 no login, 10 no "Ver lista", 12 no motorista.)
- `{rounded.lg}` 16 — cartões e linhas agrupadas.
- `{rounded.xl}` 24 — passe QR e bottom sheets.
- `{rounded.full}` — chips de status (pílula), barra de progresso, avatar de iniciais.

Os cantos da janela do scanner (raio 20, traço 5) ficam como estão — são affordance óptica.

## Components

Especificação visual. Comportamento e estados vivem em `EXPERIENCE.md` → *Component Patterns*.
Os componentes vão para `mobile/src/components/ui/` (kebab-case, export PascalCase).

- **AppHeader** — `screenOptions` do Stack de cada grupo (não um componente próprio): fundo `canvas`,
  título `title` 600 em `ink`, `headerShadowVisible: false` + divisor `hairline`, back 48dp. À direita,
  menu de overflow (`dots-vertical`) com **Sair** **[DECISÃO D-UX-5]**. Remove os títulos duplicados
  dentro das telas ("Gestão de Viagem" sob o header "Viagem"; "Minhas Rotas" sob "Minhas rotas").
- **Screen** — container com `SafeArea`, fundo `surface-soft`, gutter 16, `maxWidth` 560, variantes
  `scroll` / `fixed` e slot `footer` para a StickyActionBar.
- **PrimaryAction** — `Button` Paper `contained`, 56dp, `rounded.md`, `button` 700, ícone MDI à
  esquerda 22dp. Variantes: `primary` (tinta), `secondary` (outlined, borda `border-strong` —
  `hairline` não atinge 3:1), `danger` (vermelho), `on-color` (branco com texto na cor do overlay —
  já usado no scan), `quiet` (text button 48dp). Loading: spinner substitui o ícone, rótulo fica.
- **StickyActionBar** — faixa `canvas` nível 2 colada ao rodapé, padding 16 + inset inferior, 1–2
  ações empilhadas (primária em baixo, mais perto do polegar).
- **StatusChip** — pílula 32dp, ícone MDI 18dp + rótulo `label`: `check-circle` Embarcou,
  `clock-outline` Não embarcou, `account-cancel` Não vai voltar, `progress-clock` Em andamento,
  `flag-checkered` Concluída. Substitui os glifos `✓ — !` e os emoji `🟢 ✅` (que no web viram "tofu"
  — [audit/light-11-trip-ativa.png](audit/light-11-trip-ativa.png)).
- **BoardingCounter** — número `display-count` "28**/32**" (denominador em `muted`), rótulo
  "embarcados", barra de progresso 8dp (`surface-strong` → `status-boarded`), e linha de legenda com
  mini-contagens por status ("3 não vão voltar"). Aparece no TripCard, no topo da lista e no scan.
- **TripCard** — herói da tela Viagem: overline "VIAGEM DE IDA"/"RETORNO", nome da rota em
  `title-lg` (**nunca o UUID** — hoje aparece `880e8400-e29b-…`), StatusChip, BoardingCounter,
  "Iniciada às 18:02" em `body`. Cartão nível 1.
- **StudentRow** (evolução de `student-card.tsx`) — 64dp mín., avatar de iniciais 40dp (fundo
  `surface-strong`, iniciais `label` em `ink`), nome `title`, hora `caption`, StatusChip à direita.
  Divisor `hairline` inset 72.
- **ListSectionHeader** — overline + contagem, fundo `surface-soft`, fixo no scroll (sticky).
- **ScanFrame** (evolução de `qr-scanner.tsx`) — máscara 60% preto, cantos brancos; linha de
  varredura animada de 2dp `on-primary` 60% (ver microinterações). Dica abaixo da janela:
  "Aponte para o QR do aluno" em `body-lg` branco.
- **ScanHud** — barra superior sobre a câmera: BoardingCounter compacto em branco ("12/32") + botão
  "Ver lista" 48dp (hoje 44dp).
- **ScanResultOverlay** — cor chapada full-screen por tom; ícone MDI 96dp em círculo branco 20%
  (`check-bold`, `alert`, `close-thick`, `cloud-upload-outline`); título `headline` ≥ 24px; **nome do
  aluno** em `title-lg` quando conhecido; detalhe `title` ≥ 20px bold; ações `on-color` 56dp no pé;
  barra de contagem regressiva de 4dp no topo (auto-retomada).
- **QrPass** — "passe de embarque": cartão `rounded.xl`; faixa superior `brand-yellow` com ícone
  `bus-school`, nome do aluno `title-lg` e rota `body` em tinta; corpo branco com o QR (quiet zone
  intocada) e rodapé "Mostre ao motorista". **[DECISÃO D-UX-1]**
- **BusEtaCard** — herói do track-bus: ETA `display-count` ("~8 min"), distância `title` ("2,4 km
  de você"), chip de frescor ("Ao vivo" com ponto pulsante / "Sem sinal GPS há 3 min"); coordenadas
  brutas saem do herói e vão para `caption` recolhido (ou somem — hoje são o texto maior do cartão).
- **StateView** — um único componente para loading/empty/error/blocked: ícone MDI 48dp em círculo
  `surface-strong` 88dp, título `title-lg`, detalhe `body-lg` `muted`, ação PrimaryAction opcional.
  Substitui `Loading`/`Centered`/`Blocked`/o "⚠️ 🗺️" de routes.
- **Skeleton** — blocos `surface-strong` com shimmer, `rounded.sm`; formas espelham o conteúdo
  (TripCard, 6 StudentRows, QrPass).
- **Banner** — faixa inline no topo do conteúdo, ícone + texto `body` + ação `quiet`: `warning`
  (dado velho), `info`, `error`. Substitui o `<Banner>` MD3 cru.
- **OfflineBanner** — mantém posição (rodapé do layout do motorista); visual: `banner-offline`
  com ícone `cloud-off-outline` e contador; falha em `banner-error` com "Dispensar" `on-color`.
- **Snackbar/Toast** — Paper Snackbar, fundo `ink`, texto branco, `rounded.md`, ícone opcional.
- **ConfirmDialog** — Dialog Paper, título `title-lg`, corpo `body`, ações 48dp: confirmação
  primária `contained` (ou `danger`) à direita, "Voltar" `quiet`. Hoje ambas são text buttons
  indistintos ([audit/light-33-dialog-nao-vou-voltar.png](audit/light-33-dialog-nao-vou-voltar.png)).
- **CountdownPill** — pílula `status-not-returning-tint` com `timer-sand` e "4:32" tabular; anel
  de progresso opcional.
- **PermissionCard** — cartão nível 1 com ícone 40dp (`map-marker-radius`, `camera`), título
  `title`, texto `body-lg`, PrimaryAction.

## Do's and Don'ts

| Faça | Não faça |
|---|---|
| Ícones MaterialCommunityIcons via Paper | Emoji ou glifos textuais como ícone (`🚌 🔄 🟢 ✅ ⚠️ 🗺️ ✓ — !`) |
| Status = cor + ícone + rótulo | Status só por cor |
| Hierarquia de texto com `ink`/`body`/`muted` | `opacity` para "apagar" texto |
| Mostrar nomes (rota, aluno) | Mostrar UUID, coordenada crua ou código técnico como informação principal |
| Uma ação primária por tela, no rodapé nas telas do motorista | Três botões `contained` empilhados competindo |
| Amarelo só full-bleed, com texto tinta | Amarelo em texto, borda, chip ou telas do motorista |
| Fundo `surface-soft` em toda tela | Deixar o fundo do React Navigation (`#f2f2f2`) ou MD3 (`#fffbfe`) aparecer |
| Tokens de `lib/palette.ts` / `lib/tokens.ts` | Hex, `fontSize` ou `padding` avulsos em tela |
| Número grande e tabular para contagem/ETA | Contagem em frase corrida ("Alunos: 0/4") |
| Cartão com borda hairline | `elevation` como hierarquia |
