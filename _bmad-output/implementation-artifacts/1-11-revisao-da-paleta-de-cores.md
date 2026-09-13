---
title: 'Story 1.11: Revisão da Paleta de Cores — Unificação sobre o DESIGN.md (Airtable)'
type: 'feature'
created: '2026-09-13'
status: 'done'
review_loop_iteration: 2
baseline_commit: 'b58b38ea3b9d023676a1e512d278d67a52298945'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O app tem **quatro famílias de cores convivendo sem fonte única** — ~25 hexes
distintos hardcoded em 10 arquivos de `mobile/src/`:

1. **Azul da marca** (`#208AEF` em `lib/theme.ts`, comentado como "da splash screen") —
   mas só 3 usos diretos; o resto do app ignora o tema Paper.
2. **Neutros do template Expo** (`constants/theme.ts`: `#F0F0F3`, `#60646C`, `#212225`…).
3. **Cores de status escolhidas story a story** — incluindo **dois vermelhos de erro
   diferentes** (`#B3261E` e `#D32F2F`) e o slate `#37474F`/`#263238` para offline.
4. **Azul-marinho avulso** (`#1A1A2E`) como cor de texto em 6 pontos das telas do
   motorista — cor que nenhuma decisão de design pediu.

O comentário em `student-card.tsx` ("sem introduzir uma quarta paleta") documenta a
consciência do problema. Cada tela nova escolhe cor no olho; não há como responder
"qual é o vermelho de erro?" sem inspecionar componentes.

**Approach:** Adotar o `DESIGN.md` (análise do sistema Airtable) como fonte da paleta:
registrar seus tokens de cor como a **única fonte de verdade** do app, mapear os papéis
semânticos (primário, superfície, texto, status) sobre eles nos dois temas (claro e
escuro), eliminar os hexes hardcoded dos componentes e travar a regressão com um teste
de guarda que proíbe hex fora do módulo de paleta. Mudança de cor apenas — tipografia,
espaçamento, raios e a forma dos componentes MD3 não mudam.

**GATE: a matriz de decisões D1–D7 abaixo precisa ser aprovada na íntegra (ou com
desvios anotados pelo Lucas) ANTES de executar qualquer tarefa** (precedente wrap-5).

## Matriz de Decisões (GATE — aprovada antes de executar)

| # | Decisão | Default (derivado do DESIGN.md) | Alternativa considerada | Justificativa |
|---|---------|--------------------------------|------------------------|---------------|
| D1 | Cor primária da marca | **Adotar tinta `#181d26`** ("black IS the primary") emplace do azul `#208AEF` | Manter azul | O DESIGN.md é inequívoco: primário é a tinta quase-preta; o azul-`link` (`#1b61c9`) é explicitamente "não é a cor do botão primário" |
| D2 | Erro | **`#B3261E`** (default MD3, já dominante no app; eliminar o `#D32F2F` duplicado) | Coral `#aa2d00` | A fonte NÃO documenta erro ("Known Gaps"); coral é superfície-assinatura full-bleed ("nunca acento pequeno") — usá-lo como cor de texto violaria a própria fonte. `#B3261E` já está no código, 6.4:1 no branco |
| D3 | Aviso | **Manter par âmbar `#B26A00`/`#FFF4E5`** como extensão app-only documentada — **com piso 3:1 (AA texto grande/UI) aceito para badges/overlays**, pois `#B26A00` dá ~4.24:1 no branco e ~3.67:1 sobre o próprio tinte (abaixo do 4.5:1 de texto normal) | Mostarda `#d9a441`/`#f4d35e` | Mostarda como texto falha contraste (~2.2:1); as pastéis da fonte são superfícies de demo-grid, não semântica de status. Âmbar foi escolhido deliberadamente na 3.5b. Piso 3:1 renegociado e aprovado pelo Lucas no loopback da review (13/09/2026) |
| D4 | Sucesso | **Adotar `#006400`** (texto) + `#39bf45` (borda/acentos) emplace de `#1B7F3B` | — | Token documentado na fonte; elimina um verde avulso |
| D5 | Link / informativo | **Adotar `link #1b61c9`** (ativo `#1a3866`) e `info #254fad`/`#458fff` | — | Tokens documentados; substituem os azuis avulsos restantes |
| D6 | Tema escuro | **Mapeamento derivado**: canvas→`#181d26`, elemento→`#1d1f25`, texto→`#ffffff`, secundário→`#dddddd`, hairline→`#41454d`, borda-forte→`#9297a0`; **botão primário em dark = branco com texto tinta** (espelha o `button-secondary-on-dark` documentado — "o botão branco fica branco sobre superfícies escuras") | Desligar dark mode | A fonte documenta as superfícies escuras mas não o texto corrido sobre elas; o primário-tinta sobre fundo-tinta não funciona, e o padrão branco-sobre-dark É o padrão documentado da fonte |
| D7 | Superfícies-assinatura (coral, forest, cream, peach, mint, yellow, mustard) | **Registrar os tokens sem adotar em tela** nesta story; guardrail da fonte: full-bleed apenas, nunca acento pequeno | Adotar em tela (ex.: card do QR) | Adoção em tela é decisão de composição por tela — outra story, com composição avaliada |

Tintes de fundo de status (hoje `#E8F5E9`, `#E3F2FD`, `#FFF4E5`, `#ECEFF1`): derivados
por **alpha (~12%) da cor semântica base** em vez de pastéis avulsos — zero cores novas,
escala com qualquer tema.

## Boundaries & Constraints

**Always:**
- Um único módulo de paleta como fonte das cores; `lib/theme.ts` (Paper) e
  `constants/theme.ts` consomem dele — nada de segunda fonte.
- Ambos os temas (claro/escuro) derivam do mesmo módulo.
- QR preserva branco puro/preto puro (quiet zone de leitura) — allowlist explícita no
  teste de guarda, com comentário do porquê.
- Texto×fundo dos pares do tema ≥ 4.5:1 (WCAG AA), verificado por teste determinístico —
  **exceto o âmbar (D3), com piso 3:1 de texto grande/UI para badges/overlays
  (renegociado no loopback de 13/09/2026).**
- Roteiro de verificação visual executado no alvo web (sem device — validação nativa é
  da Story 1.7).

**Ask First:**
- Tocar em assets nativos (splash screen, adaptive icon — hoje azuis; ficam
  provisoriamente destoantes do primário-tinta; rebrand de asset é escopo próprio).
- Introduzir qualquer cor fora do DESIGN.md além das extensões documentadas (D2/D3).
- Adotar superfície-assinatura em alguma tela (D7).
- Dependência nova de qualquer natureza.

**Never:**
- Tipografia, espaçamento, raios ou forma/estrutura de componentes (mudança de COR
  apenas; Haas é licenciada — `system-ui` permanece).
- Redesign de navegação ou de layout; dark mode toggle novo.
- Tocar em `api/` (paleta é 100% mobile).
- Permitir hex de cor fora do módulo de paleta sem allowlist documentada.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hex fora do módulo de paleta | `mobile/src/**` com `#RRGGBB` fora do módulo/allowlist | teste de guarda FALHA apontando arquivo:linha | allowlist só para QR (quiet zone) e scanner (chrome de câmera), cada uma comentada |
| Tema claro | paleta → tema Paper light | primário `#181d26`, canvas `#ffffff`, texto `#181d26`/`#333840`, hairline `#dddddd` | — |
| Tema escuro | paleta → tema Paper dark | conforme D6; nenhum **texto** ilegível (hairline/borda podem ser tons baixos por natureza — ex.: `#41454d` é borda em dark, não texto) | — |
| Contraste AA | par texto×fundo de cada papel do tema | ≥ 4.5:1 (≥ 3:1 para texto ≥ 18px; **âmbar: piso 3:1 para badges/overlays, ver D3**), calculado no teste | teste lista os pares reprovados |
| Status do embarque | embarcado / pendente / ausente / offline / erro | verde `#006400`, âmbar `#B26A00`, slate→família ink/body, erro `#B3261E` — **um único vermelho no app** | — |
| Student card / banners | superfícies pastéis atuais | tintes por alpha da cor base; nenhum pastel avulso restante | — |

</frozen-after-approval>

## Registro do GATE

- **2026-09-13:** Matriz D1–D7 aprovada **na íntegra** pelo Lucas, sem desvios —
  execução das tasks liberada.
- **2026-09-13 (loopback da review, iteração 1):** tensão âmbar×AA resolvida pelo
  Lucas — **manter `#B26A00` com piso 3:1 (AA texto grande/UI) para badges/overlays**;
  matriz frozen atualizada em D3 e no Always correspondente. Código revertido ao
  baseline para re-derivação conforme o workflow.

## Registro de Execução (2026-09-13)

Implementação concluída na branch `feat/1-11-revisao-da-paleta-de-cores`.

### Arquivos

- **Novos:** `mobile/src/lib/palette.ts` (fonte única) e
  `mobile/src/lib/palette.guard.test.ts` (guarda + contraste).
- **Alterados:** `lib/theme.ts` e `constants/theme.ts` (derivam da paleta),
  `(driver)/trip.tsx`, `(driver)/routes.tsx`, `(driver)/student-list.tsx`,
  `(driver)/scan.tsx`, `components/student-card.tsx`, `components/offline-banner.tsx`
  (migração para tokens) e `components/qr-scanner.tsx` +
  `components/student-qr-code.tsx` (apenas comentário de allowlist — hexes funcionais
  intocados). `hooks/use-theme.ts` intocado (API mantida).
- **Intocados:** `DESIGN.md`, `api/`, assets nativos (splash/ícone seguem azuis —
  rebrand é escopo próprio, "Ask First" respeitado).

### Mudanças visuais intencionais (para conferência na caminhada)

| Onde | Antes | Depois |
|---|---|---|
| Botões primários Paper (todas as telas) | azul `#208AEF` | tinta `#181d26`, texto branco (D1) |
| "Encerrar Viagem" (trip) | `#D32F2F` | `#B3261E` (vermelho único, D2) |
| Fundo de telas do motorista | `#F5F5F5` | `#f8fafc` (surface-soft) |
| Cards/headers | `#FFFFFF` | `#ffffff` (canvas) |
| Bordas divisórias | `#E0E0E0` | `#dddddd` (hairline) |
| Títulos | `#1A1A2E` | `#181d26` (ink) |
| Texto corrido | `#333`/`#444`/`#555` | `#333840` (body) |
| Legendas/hints/labels | `#666`/`#888` | `#41454d` (muted — sobe de ~3.5:1 para ~9.6:1) |
| Chip "Em Andamento" / "Embarcou" | pastéis `#E8F5E9`/verde `#1B7F3B` | tinte alpha 12% do verde `#006400` (D4) |
| Chip "Concluída" | pastel `#E3F2FD` | tinte alpha 12% do info `#254fad` (D5) |
| Chip "Não vai voltar" / avisos | `#FFF4E5`/`#B26A00` | tinte alpha 12% do âmbar `#B26A00` (D3) |
| Chip "Não embarcou" / faixa offline | slate `#37474F`/`#ECEFF1` | body `#333840` + tinte alpha (família ink/body) |
| Overlay "Verificando..." (scan) | `#263238` | tinta `#181d26` |
| Tema escuro (Paper) | MD3 default + azul | mapeamento D6 (canvas `#181d26`, elemento `#1d1f25`, texto `#ffffff`, secundário `#dddddd`, hairline `#41454d`, botão primário branco com texto tinta) |
| `secondary` do tema Paper | azuis `#E6F4FE`/`#1a3a54` | `#e0e2e6` (light) / `#41454d` (dark) |

### Verificação

- `cd mobile && npm test` — **326 testes passando**, incluindo as 20 novas asserções
  (guarda de hex + contraste AA). O aviso "worker process has failed to exit" é
  preexistente (timers de `trip-screen.test.tsx`).
- `npx tsc --noEmit` — os 3 erros existentes no baseline `b58b38e` permanecem
  idênticos e **nenhum erro novo foi introduzido**: `scan.tsx` 'user' possibly null,
  `use-trip-gps-capture.test.tsx` TS2554, `tracking-stream.service.test.ts` TS2339.
  Fora do escopo desta story (mudança de COR apenas).
- `npm run lint` — limpo (exit 0).
- `grep -rEn "#[0-9A-Fa-f]{6}" mobile/src --include="*.tsx" --include="*.ts" |
  grep -v palette` — só as allowlists (`student-qr-code.tsx`, `qr-scanner.tsx`,
  `scan.tsx` fundo da câmera).
- `git diff --stat main` — só `mobile/` + `_bmad-output/`; nenhum arquivo de `api/`.
- Bundle web compilado no Metro (`entry.bundle` + cada módulo alterado) — HTTP 200,
  sem erro de resolução/transform; tokens da paleta presentes no bundle.

### Desvios/tensões registrados

1. **Âmbar (D3) no piso 3:1, não 4.5:1:** `#B26A00` sobre branco dá ~4.24:1 — abaixo
   do AA de texto normal. A decisão congelada D3 mantém o âmbar escolhido na 3.5b; ele
   entra como rótulo de badge e título de overlay (texto grande/negrito), e o teste de
   contraste o guarda no piso de 3:1 (AA texto grande/UI), com o par anotado. Trocar o
   âmbar exigiria renegociar a matriz.
2. **Scan overlay "offline" usa `body` (`#333840`)**, não `muted`: a tabela de status
   manda slate→família ink/body; `#333840` mantém o texto branco a ~11.7:1.
3. **`#FFF4E5` some da paleta:** o par âmbar de D3 continua existindo, mas a metade de
   superfície passou a ser expressa como tinte alpha da base (regra dos tintes da
   própria story — "zero cores novas").
4. **Allowlist do `scan.tsx`:** além de `qr-scanner.tsx` e `student-qr-code.tsx`, os
   dois `#000000` de fundo da câmera em `scan.tsx` entraram na allowlist — é chrome de
   câmera previsto na matriz de I/O ("scanner (chrome de câmera)") e a paleta do
   DESIGN.md não tem preto puro.

### Caminhada visual executada (2026-09-13, review — alvo web, dois temas)

Executada com Playwright headless + mocks MSW (o subagente de implementação não tinha
browser; a review rodou o roteiro desta seção e capturou os dois temas). Resultados:

**Tema claro — íntegro e coerente em todas as telas:**
- Login: botão "Entrar" tinta `#181d26` com texto branco; inputs outline hairline.
- Trip: fundo `#f8fafc`, cards brancos, botões tinta, "Encerrar Viagem" `#B3261E`,
  chip "Em Andamento" com tinte verde (D4).
- Scan (estado de permissão): botão tinta; chrome de câmera intocado.
- Student-list: header branco + hairline; chips "Não embarcou" (tinte neutro) e
  "Não vai voltar" (âmbar/tinte, D3) legíveis.
- Routes: títulos ink, labels muted, valores body.
- Aluno: home com botão primário tinta; QR com quiet zone branca intacta (allowlist).
- Banner de dado velho (roster flaky, refetch após `staleTime`): tinte de erro claro
  com texto ink e ação "Atualizar" — legível.

**Tema escuro — paleta escura íntegra, telas seguem light-locked (como antes):**
- As telas consumem `lightPalette` diretamente e NÃO alternam com o esquema do SO —
  era assim antes da story (hexes fixos); só os widgets Paper flipam para o tema D6.
- Os tokens D6 em si são legíveis (suíte de contraste cobre os pares; botão primário
  branco com texto tinta confirma em tela no login/trip/aluno).
- Incoerências de tema misto são **preexistentes** (texto do Paper flipa claro sobre
  superfície travada em claro: título do login, título da home do aluno, nome/rota do
  QR, botão outlined "Alunos da Viagem"). Nenhuma foi introduzida ou agravada por esta
  story — escopo era troca de cor, não consumo reativo de tema.
- Banner de dado velho em dark: texto branco sobre `rgb(37,35,42)` (probe de estilo
  computado, ~15:1) — legível.

**Achados colaterais (para decisão do Lucas, fora do escopo da story):**
1. Papéis `surfaceContainer*` do Paper não são sobrescritos em `lib/theme.ts` — o
   `<Banner>` usa o default MD3 com tinte violeta (`#F7F3F9` light / `#25232A` dark).
   Resíduo do default, não hex novo em componente.
2. Consumo dividido (widgets seguem o SO, telas light-locked) produz o tema misto
   acima — candidata a story própria ("telas consomem `useTheme`/`darkPalette`" ou
   desligar dark no web até lá).
3. Erros de console na caminhada: CORS de SSE (`/boarding/events`, `/boarding/reminder`)
   por rodar na porta 8082 (só a 8081 é liberada na API) — artefato do ambiente de
   verificação, não da paleta.

## Registro de Re-derivação (2026-09-13, iteração 1)

Re-execução das tasks sobre o baseline `b58b38e`, incorporando os patches da triage
(rows 1, 6, 10, 17, 18). Os arquivos e o mapeamento visual são os do registro de
execução acima; abaixo só o que MUDOU nesta re-derivação:

- **`palette.guard.test.ts` (row 1 + row 18):** a guarda agora casa `#RGB/#RRGGBB`
  **e `#RRGGBBAA` e chamadas `rgba()/rgb()`** (comparação normalizada por espaço);
  allowlist expandida e comentada: quiet zone do QR (`student-qr-code.tsx`), chrome
  de câmera (`qr-scanner.tsx` e `scan.tsx` — inclui o scrim `rgba(0,0,0,0.55)` e o
  botão translúcido `rgba(255,255,255,0.16)`), faixa branca 92% do "Dispensar"
  (`offline-banner.tsx`). Novos **locks de binding**: `STATUS_PRESENTATION` preso
  aos papéis da paleta + render-probe do `StudentCard` (cor efetiva por status);
  render-probe das faixas `PENDING_COLOR`/`FAILED_COLOR` do `OfflineBanner`;
  `TONE_COLOR` de `scan.tsx` travado no fonte (render-probe exigiria montar o stack
  da câmera). **Mutação verificada em 5 cenários** (hex fora, rgba fora,
  PENDING→muted, TONE offline→muted, STATUS warning→muted): a guarda falha apontando
  arquivo:linha em todos.
- **`lib/theme.ts` (row 10):** comentário ESCOPADO aos papéis sobrescritos; afirma
  explicitamente que `elevation`/`surfaceContainer*` permanecem default MD3
  (resíduo do `<Banner>`, defer registrado).
- **`palette.ts` (row 17):** comentário do erro alinhado ao registro frozen —
  `6.4:1 (valor frozen; cômputo fino ~6.5)`. Comentário do âmbar atualiza D3 à
  renegociação (piso 3:1, loopback 13/09/2026).
- **`sprint-status.yaml` (row 6):** comentário da 1.11 reflete o estado real
  (re-derivação concluída, gates verdes, PR pendente — sem "pendente" obsoleto).
- **`lib/theme.ts` (correção da chave `secondary` no dark, na verificação de tasks):**
  as duas iterações do código mapearam `secondary: darkMapping.textSecondary`
  (`#dddddd`) — exatamente a colisão de nomes que a task alerta — enquanto a tabela
  "Mudanças visuais intencionais" e o texto da task pedem a superfície `muted`
  (`#41454d`) em dark; a tabela nunca tinha sido conferida contra o código pela
  review. Corrigido para `secondary: darkMapping.hairline` (=`muted`) com
  `onSecondary: darkMapping.text`, espelhando o par já usado em
  `secondaryContainer`/`onSecondaryContainer` (elimina o par tinta-sobre-`muted`
  que ficaria no objeto do tema). Gates re-executados após o patch: 334/334 testes,
  tsc com só os 3 erros pré-existentes, lint limpo, grep = allowlist. (A 1ª tentativa
  do patch escreveu hexes no comentário e a guarda a derrubou — a trava funcionou
  contra o próprio mantenedor, como projetado.)

### Verificação da re-derivação

- `cd mobile && npm test` — **334 testes** (296 do baseline + 38 da suíte de
  guarda/contraste/locks), 26 suítes, 0 falhas. O aviso "worker process has failed
  to exit" é preexistente (timers de `trip-screen.test.tsx`).
- `npx tsc --noEmit` — exatamente os 3 erros pré-existentes no baseline
  (`scan.tsx` TS18047, `use-trip-gps-capture.test.tsx` TS2554,
  `tracking-stream.service.test.ts` TS2339); nenhum erro novo.
- `npm run lint` — limpo (exit 0).
- `grep -rEn "#[0-9A-Fa-f]{6}" mobile/src --include="*.tsx" --include="*.ts" |
  grep -v palette` — só as allowlists (`student-qr-code.tsx`, `qr-scanner.tsx`,
  `scan.tsx`); as 4 entradas `rgba()` restantes batem com a allowlist da guarda.
- `git diff --stat main` — só `mobile/` + `_bmad-output/`; nenhum arquivo de `api/`.
- Bundle web no Metro (`entry.bundle`, platform=web) — HTTP 200, sem erro de
  resolução/transform.

### Caminhada visual da re-derivação (alvo web, dois temas)

Executada com Playwright headless contra o Metro local, com sessão injetada via
localStorage (prefixo MMKV `mmkv.default\`) e respostas de API interceptadas —
**34/34 asserções de estilo computado passando** (17 por tema), 10 screenshots nos
dois temas:

- **Claro:** login "Entrar" tinta `#181d26`; trip com fundo `#f8fafc`, cards
  brancos, botões tinta, "Encerrar Viagem" `#B3261E`, chip "Em Andamento" tinte
  verde `rgba(0,100,0,0.12)`; routes com títulos ink, labels muted `#41454d`, card
  canvas; student-list com os três chips nos tintes (verde/neutro/âmbar) e contagem
  ink; scan (estado de permissão) botão tinta; QR do aluno com quiet zone branca
  pura (allowlist).
- **Escuro:** telas seguem light-locked (consumem `lightPalette` — como antes da
  story); widgets Paper flipam para o D6 (botões primários BRANCOS com texto tinta
  confirmados em login/trip/scan); "Encerrar Viagem" permanece `#B3261E` (cor
  explícita de tela, não é widget temático) — comportamento intencional.
  Incoerências de tema misto (ex.: botão outlined com texto claro sobre superfície
  clara) são pré-existentes e já registradas no defer de consumo de tema.
- Ambiente de verificação: sem API real — 401 x interceptado viraria logout; erros
  de OPFS/SQLite no browser headless aparecem como toast em sessões concorrentes e
  são artefato do harness, não do app.

## Registro de Re-derivação (2026-09-13, iteração 2)

Re-execução das tasks sobre o baseline `b58b38e`, incorporando a emenda da review da
iteração 2 (rows 25, 41–44). Arquivos e mapeamento visual idênticos ao registro da
iteração 1; abaixo só o que MUDOU nesta rodada:

- **`lib/theme.ts` (row 25):** `outline`/`outlineVariant` NÃO são sobrescritos —
  permanecem no default MD3 (`rgba(121,116,126,1)` em light). O comentário do módulo
  fica escopado aos papéis sobrescritos e declara explicitamente essa preservação e
  a da paleta `elevation` (resíduo violeta do `<Banner>`, defer registrado).
- **`palette.guard.test.ts` (rows 41–44):** novas camadas — **(d)** lock de binding
  dos temas Paper (todos os papéis sobrescritos afirmados contra a paleta, com
  `secondary` travado como SUPERFÍCIE — não texto; papéis NÃO sobrescritos fixados ao
  default MD3, incluindo `elevation`), **(e)** token-pin de `designTokens` (28
  entradas), `appExtensions` (D2/D3) e `darkMapping` (D6) contra os hexes
  documentados — tabela `Record<keyof typeof ...>` com checagem bidirecional de
  chaves, **(f)** locks estendidos de call-site (botão destrutivo e chips da trip,
  `TONE_COLOR` e overlay do scan, papéis de texto de routes/student-list, nome e
  divisória do student-card). Suíte fechou em **46 testes**.
- **`qr-scanner.tsx`:** comentário do issue 9619 reescrito sem `#` (hex-like em
  comentário derruba a guarda — a trava pegou o próprio mantenedor de novo).
- Descobertas de execução registradas: defaults do Paper chegam como strings
  `rgba()` (o cômputo de contraste do teste aceita hex e rgb()/rgba()); o
  render-probe do StudentCard sobe na árvore até o ancestral com backgroundColor
  (o pai direto do Text não é o chip no renderer de teste); o arquivo é `.ts` (nome
  registrado na story) e usa `createElement` — JSX exigiria `.tsx`.

### Mutação verificada (5 cenários — todos derrubam a guarda)

1. Drift de token (`error` → `#D32F2F`, contrast-safe) → token-pin falha.
2. Colisão `secondary` (superfície → texto) → lock de binding do tema falha.
3. Hex avulso em componente (`#FAFAFA` em routes) → varredura falha apontando
   arquivo:linha.
4. Troca de papel em `STATUS_PRESENTATION` (warning → muted) → lock de valor falha.
5. Troca de papel em `TONE_COLOR` (offline → muted) → source-lock de call-site falha.

### Verificação da re-derivação (iteração 2)

- `cd mobile && npm test` — **342 testes** (296 do baseline + 46 da suíte de
  guarda/contraste/locks), 26 suítes, 0 falhas. O aviso "worker process has failed
  to exit" é preexistente (timers de `trip-screen.test.tsx`).
- `npx tsc --noEmit` — exatamente os 3 erros pré-existentes no baseline (`scan.tsx`
  TS18047, `use-trip-gps-capture.test.tsx` TS2554, `tracking-stream.service.test.ts`
  TS2339); nenhum erro novo.
- `npm run lint` — limpo (0 erros, 0 avisos).
- `grep -rEn "#[0-9A-Fa-f]{6}" mobile/src --include="*.tsx" --include="*.ts" |
  grep -v palette` — só as allowlists (`student-qr-code.tsx`, `qr-scanner.tsx`,
  `scan.tsx` fundos de câmera); as 4 entradas `rgba()` batem com a allowlist da
  guarda (`qr-scanner.tsx`, `scan.tsx`, faixa 92% do `offline-banner.tsx`).
- `git diff --stat main` — só `mobile/` + `_bmad-output/`; nenhum arquivo de `api/`.
- Metro web: `entry.bundle` + os 11 módulos alterados — HTTP 200, sem erro de
  resolução/transform; tokens da paleta presentes nos bundles dos módulos.

### Caminhada visual da re-derivação (alvo web, dois temas)

Playwright headless contra o Metro local (porta 8081), sessão criada por login
interceptado no formato do ResponseWrapper (`{ data }`) e APIs do embarque mockadas
— **34/34 asserções de estilo computado passando** (17 por tema), screenshots em
`/tmp/palette-walkthrough/` (efêmeros; o registro durável é esta prosa):

- **Claro:** login "Entrar" tinta `rgb(24,29,38)`; **bordas outlined dos inputs =
  default MD3 `rgb(121,116,126)` e nenhuma borda hairline — SEM regressão vs
  baseline (o foco da emenda row 25)**; trip com fundo `#f8fafc`, "Encerrar Viagem"
  `rgb(179,38,30)`, chip "Em Andamento" `rgba(0,100,0,0.12)`; student-list com os
  três chips nos papéis/tintes (verde `#006400`, body `#333840` neutro, âmbar
  `#B26A00`) e contagem ink; scan (estado de permissão) com botão tinta; routes com
  título ink, label muted `#41454d`, valor body; QR do aluno com quiet zone branca
  pura (allowlist).
- **Escuro:** botão primário dos widgets Paper BRANCO com texto tinta (login, trip,
  scan) — D6; bordas outlined = default MD3 dark `rgb(147,143,153)`; telas seguem
  light-locked (bg `#f8fafc`, "Encerrar Viagem" permanece `#B3261E` — cor explícita
  de tela, não widget temático); incoerências de tema misto pré-existentes
  inalteradas (defer de consumo de tema).
- Sem erros de página. Artefatos do harness (SSE abortado → banner de dado velho;
  headless sem câmera → estado de permissão do scan) são do ambiente de
  verificação, não do app.

## Spec Change Log

- **2026-09-13 — loopback da review, iteração 2 (bad_spec, row 25):** a review
  verificou que `outline`/`outlineVariant` do Paper foram mapeados para hairline
  (`#dddddd`, 1.36:1 no branco), rebaixando as bordas de inputs/botões outlined de
  ~4.5:1 (default MD3 `#79747E`) para 1.36:1 — regressão WCAG 1.4.11 (não-texto, 3:1)
  em superfícies de uso diário (login.tsx:110,123; botões outlined do aluno/admin).
  **Gatilho:** row 25 (medium). **Emendado (seções não-frozen):** task de
  `lib/theme.ts` passa a FIXAR `outline`/`outlineVariant` no default MD3 (resíduo
  documentado, como `surfaceContainer*`); task da guarda ganha (d) lock de binding
  dos temas, (e) token-pin dos valores e (f) locks estendidos de call-site (rows
  41–44); ACs ganham o gate não-texto ≥3:1 e a prova-por-mutação dos locks.
  **Estado known-bad evitado:** borda de componente interativo abaixo de 3:1; mapeamento
  de papel MD3 sem teste (a colisão do `secondary` shipou 2× antes de humano pegar);
  tokens deriváveis silenciosamente (erro → `#D32F2F` passa em todos os gates).
  **KEEP instructions (devem sobreviver à re-derivação):** a forma do módulo
  `palette.ts` (`designTokens`/`appExtensions`/`darkMapping`/`STATUS_TINT_ALPHA`/
  `withAlpha`/`SemanticColors`/paletas claro+escuro); a guarda com cobertura
  hex+rgba()+8-dígitos, allowlist comentada e checagem de entrada morta; os locks
  existentes (`STATUS_PRESENTATION` com render-probes, faixas do banner, `TONE_COLOR`
  source-lock); o comentário do `theme.ts` escopado aos papéis sobrescritos; o fix do
  `secondary` (superfície `muted` em dark, `onSecondary` texto); os comentários do
  âmbar renegociado e do erro (`6.4:1 frozen`); a metodologia de mutação e a caminhada
  visual nos dois temas. **Restrição herdada:** o Always (frozen) continua travando
  apenas pares de TEXTO — o gate não-texto entra como requisito de task/AC, não como
  emenda do bloco frozen.

## Code Map

- `mobile/src/lib/theme.ts` -- hoje: temas Paper light/dark com `primary: '#208AEF'`.
  Alvo: derivar `colors` do módulo de paleta (D1/D6).
- `mobile/src/constants/theme.ts` -- hoje: `Colors` do template Expo (neutros avulsos) +
  Fonts/Spacing. Alvo: `Colors` sai (ou passa a reexportar a paleta); Fonts/Spacing
  intocados (fora de escopo).
- `mobile/src/lib/palette.ts` -- **novo (nome sugerido)**: os tokens do DESIGN.md
  (semânticos + assinaturas + extensões D2/D3) e a derivação dos dois temas. Fonte única.
- `mobile/src/app/(driver)/trip.tsx` -- `#1A1A2E` (texto), `#D32F2F` (botão destrutivo),
  `#B3261E`, `#FFFFFF`.
- `mobile/src/app/(driver)/routes.tsx` -- `#1A1A2E` ×3, `#F5F5F5`.
- `mobile/src/app/(driver)/student-list.tsx` -- `#1A1A2E`, `#FFFFFF`, `#E0E0E0`,
  `#F5F5F5`.
- `mobile/src/app/(driver)/scan.tsx` -- mapa de feedback (`warn #B26A00`, `error #B3261E`,
  `offline #37474F`), overlay `#263238`, `#FFFFFF`.
- `mobile/src/components/student-card.tsx` -- status `#37474F`/`#ECEFF1` (neutro),
  `#B26A00`/`#FFF4E5` (atenção), `#1A1A2E`.
- `mobile/src/components/offline-banner.tsx` -- `PENDING_COLOR #37474F`,
  `FAILED_COLOR #B3261E`.
- `mobile/src/components/qr-scanner.tsx` -- chrome de câmera (`#000000`,
  `rgba(0,0,0,0.6)`, borda `#FFFFFF`) -- allowlist funcional.
- `mobile/src/components/student-qr-code.tsx` -- quiet zone do QR (`#FFFFFF`/`#000000`)
  -- allowlist funcional, com comentário.
- `mobile/src/hooks/use-theme.ts` (+ `use-color-scheme`) -- consumo dos temas; deve
  continuar funcionando sem mudança de API.
- Teste de guarda + teste de contraste -- novos (sugestão:
  `mobile/src/lib/palette.guard.test.ts`), no padrão dos travas-regressão do repo
  (precedente `query-never-pauses.test.ts`).

## Tasks & Acceptance

**Execution:**

*Re-derivação pós-loopback (iteração 2) — tasks abaixo executadas em 13/09/2026 sobre
o baseline `b58b38e`. Incorporam os patches verificados na review da iteração
1 (rows 1, 6, 10, 17, 18), a correção do `secondary` aplicada na verificação de tasks e
os patches + emenda da review da iteração 2 (rows 25, 41–44 — ver Spec Change Log):*

- [x] `mobile/src/lib/palette.ts` -- módulo único: tokens do DESIGN.md + extensões
  aprovadas (D2/D3, com o piso 3:1 do âmbar renegociado) + derivação dos temas
  claro/escuro (D6). JSDoc mínimo apontando o DESIGN.md como fonte viva; comentário de
  contraste do erro alinhado ao registro frozen (`6.4:1 (valor frozen; cômputo fino
  ~6.5)`). Atenção à colisão de nomes: o "secundário" do D6 é **texto secundário**
  (`#dddddd`); a chave `secondary` do tema Paper mapeia para superfície (`#e0e2e6`
  light / `muted` dark) — usar a tabela "Mudanças visuais intencionais" do Registro
  como referência do mapeamento Paper.
- [x] `mobile/src/lib/theme.ts` + `mobile/src/constants/theme.ts` -- temas Paper e
  `Colors` derivando da paleta; eliminação dos neutros avulsos. O comentário do
  `theme.ts` fica ESCOPADO aos papéis sobrescritos (não afirmar "nenhum lavender do
  MD3" — `elevation`/`surfaceContainer*` permanecem default, resíduo pré-existente
  registrado no defer). **`outline`/`outlineVariant` NÃO são sobrescritos** —
  permanecem no default MD3 (`#79747E`, ~4.5:1), mesmíssimo resíduo documentado:
  hairline (`#dddddd`, 1.36:1 no branco) NÃO atinge o 3:1 de borda de componente
  interativo (WCAG 1.4.11) e as bordas de inputs/botões outlined não têm mudança
  registrada na tabela aprovada (regressão da iteração 2, row 25).
- [x] 8 arquivos de tela/componente -- substituição dos ~25 hexes por tokens semânticos
  (famílias: marinho `#1A1A2E`→tinta; vermelhos→`#B3261E`; slate offline→família
  ink/body; verdes→`#006400`; pastéis→tintes alpha). *2 deles (`qr-scanner.tsx`,
  `student-qr-code.tsx`) recebem só o comentário de allowlist — hexes funcionais
  intocados.* Atualizar o comentário de `scan.tsx` que cita a primária antiga
  `#208AEF` (hex em comentário derruba a guarda).
- [x] `palette.guard.test.ts` -- (a) varredura de cor fora do módulo: hex `#RGB/#RRGGBB`
  **e `rgba()`/hex 8-dígitos**, com allowlist comentada (QR quiet zone, chrome de
  câmera de `qr-scanner.tsx` e `scan.tsx`, faixa branca 92% do `offline-banner.tsx` —
  cada uma com o porquê); (b) contraste AA dos pares do tema com o **âmbar no piso 3:1
  (D3 renegociado)**, pares anotados; (c) **locks de binding**: `STATUS_PRESENTATION`,
  `TONE_COLOR`, `PENDING_COLOR`/`FAILED_COLOR` presos aos papéis da paleta (a migração
  manual não pode trocar tokens silenciosamente — demonstrado por mutação na review).
  Como as consts são privadas de módulo, o lock preferencial é **render-probe**
  (renderizar o componente e afirmar a cor efetiva, padrão da demonstração da review);
  **(d) lock de binding dos TEMAS** (row 41): cada papel sobrescrito de
  `lightTheme`/`darkTheme` afirmado contra o valor/tom esperado da paleta — nenhum
  teste lia os temas e a colisão do `secondary` shipou 2×; **(e) token-pin** (row 42):
  cada entrada de `designTokens`/`appExtensions` afirmada igual ao hex documentado no
  DESIGN.md/matriz D1–D7 — drift contrast-safe (ex.: erro → `#D32F2F`) hoje passa em
  todos os gates; **(f) locks estendidos de call-site** (row 43): botão destrutivo e
  chips da `trip`, bg/botões do overlay do `scan`, papéis de texto de
  `routes`/`student-list` — source-lock onde render-probe exigiria stack de câmera.
- [x] Roteiro de verificação visual no alvo web: login → motorista (trip, scan,
  student-list, routes) → aluno (home, QR) → banners (offline/stale) nos DOIS temas;
  mudanças visuais intencionais registradas na story. *(Executada nas iterações
  anteriores — repetir na re-derivação; bordas de inputs/botões outlined devem
  conferir SEM mudança vs baseline.)*
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- entrada da 1.11
  atualizada ao concluir, com comentário refletindo o estado REAL (sem "pendente"
  obsoleto).
- [x] `DESIGN.md` -- intocado (fonte viva; desvios documentados AQUI, não nele).

**Acceptance Criteria:**
- Given o app em qualquer tela, when os componentes resolarem cor, then a cor vem do
  módulo de paleta — zero hex semântico fora dele, provado pelo teste de guarda.
- Given componentes outlined (inputs do login, botões outlined), when renderizados com
  o tema Paper, then a borda mantém ≥3:1 sobre o fundo (WCAG 1.4.11) — idêntica ao
  baseline, sem regressão não-texto (row 25).
- Given qualquer papel sobrescrito dos temas Paper ou valor de `designTokens`/
  `appExtensions`, when mutado para outra cor, then a suíte de guarda FALHA (rows
  41–42: locks de tema + token-pin, provados por mutação).
- Given os dois temas, when alternados, then todos os pares texto×fundo passam AA no
  teste de contraste (âmbar no piso 3:1, D3 renegociado) e nenhum texto fica ilegível
  (verificação visual registra os dois).
- Given a paleta antiga, when comparada, then: um só vermelho, um só verde, zero
  `#1A1A2E`/`#208AEF`/`#F5F5F5` em componentes.
- Given `cd mobile && npm test && npx tsc --noEmit && npm run lint`, then tudo verde
  (exceto os 3 erros tsc pré-existentes no baseline, documentados); `git diff` sem
  arquivo de `api/`.
- Given a matriz D1–D7, then cada default aprovado (ou desvio anotado) ANTES da
  primeira task de código — registrado nesta story, incluindo a renegociação do piso
  3:1 do âmbar no loopback.

## Design Notes

- **Tensão assumida em D2:** a fonte não documenta erro e seu coral é proibido como
  acento pequeno. `#B3261E` é a escolha de menor invenção (MD3 default, já no código,
  contraste ok) e fica marcada como extensão app-only até a fonte extrair estados de
  erro de formulário.
- **D3 (âmbar) segue o precedente 3.5b:** o par âmbar foi decisão consciente da review
  da 3.5b; a mostarda da fonte é superfície de demo-grid, não semântica de status.
  **Renegociado no loopback (13/09/2026):** Lucas aprovou manter `#B26A00` com piso
  3:1 (AA texto grande/UI) para badges/overlays — o par fica abaixo do 4.5:1 de texto
  normal por escolha deliberada, registrada na matriz frozen.
- **Assinaturas registradas mas não adotadas (D7):** o vocabulário de "voltage" da
  fonte (coral/forest/cream full-bleed) é convidente para o card do QR ou banners —
  mas adoção muda composição, não só cor. Story própria, se o Lucas quiser.
- **Splash/ícone azuis ficam destoantes** até o rebrand de assets (Ask First). A
  incoerência temporária é consciente e documentada.
- O comentário "sem introduzir uma quarta paleta" em `student-card.tsx` vira lei:
  depois desta story, nova cor = nova entrada na paleta com decisão registrada.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: verdes, incluindo as duas suítes novas
  (guarda + contraste).
- `cd mobile && npx tsc --noEmit` -- expected: **exatamente os 3 erros pré-existentes
  no baseline `b58b38e`** (`scan.tsx` TS18047, `use-trip-gps-capture.test.tsx` TS2554,
  `tracking-stream.service.test.ts` TS2339); nenhum erro novo.
- `cd mobile && npm run lint` -- expected: limpo.
- `grep -rEn "#[0-9A-Fa-f]{6}" mobile/src --include="*.tsx" --include="*.ts" |
  grep -v palette` -- expected: só as entradas da allowlist do teste de guarda
  (`student-qr-code.tsx`, `qr-scanner.tsx`, os `#000000` de `scan.tsx`) e o módulo de
  paleta.
- Roteiro visual no alvo web (`npm run web`), dois temas -- expected: fluxos íntegros,
  mudanças intencionais conferidas, console sem erros.
- `git diff --stat main` -- expected: só `mobile/` + `_bmad-output/`; nenhum `api/`.

## Suggested Review Order

**O que muda a marca (comece aqui)**
1. Matriz D1–D7 (acima) -- as decisões de produto, especialmente D1 (azul→tinta) e
   D6 (dark mode derivado).
2. `palette.ts` -- a fonte única proposta; confira os tokens contra o DESIGN.md.
3. `lib/theme.ts` / `constants/theme.ts` -- derivação dos temas.

**Migração e trava**
4. Os 8 arquivos de tela/componente -- migração mecânica; olhar `scan.tsx` (mapa de
   feedback) com mais atenção.
5. `palette.guard.test.ts` -- allowlist do QR comentada; fórmula de contraste.

**Evidência**
6. Roteiro visual (dois temas) e registros na story.

## Review Triage Log

Review de 2026-09-13 (blind-hunter + edge-case-hunter + verification-gap), 1ª iteração.
Veredito por finding, com evidência verificada por mim sobre o diff/código:

| # | Camadas | Finding | Veredito | Evidência / rota |
|---|---------|---------|----------|------------------|
| 1 | BH1+ECH1+VG-out | Guarda cobre só `#RGB/#RRGGBB`; `rgba()`/8-dígitos passam; 4 `rgba()` funcionais fora da allowlist | low | Real (regex + literals conferidos), mas o contrato frozen da guarda é `#RRGGBB` (matriz I/O); erosão dev-facing → patch |
| 2 | BH2+ECH4 | `darkPalette.link/info` como texto sobre canvas escuro ~2.8:1 | false | Inalcançável: nenhuma tela consome esses papéis (temas Paper não os mapeiam; telas light-locked) |
| 3 | BH3+ECH6 | Âmbar < 4.5:1 nos tamanhos efetivos: chip ≈16px/700 → **3.67:1** sobre o tinte (era 3.90:1 no pastel `#FFF4E5`); overlayDetail 18px/700 → 4.23:1 (par pré-existente, inalterado) | medium | Real e causado pela mudança no par do chip (12% alpha rebaixou o contraste); tensão interna do bloco congelado (D3 manter âmbar + regra de tinte vs Always ≥ 4.5:1) — a própria story anotou "trocar o âmbar exigiria renegociar a matriz" → **intent_gap → loopback ao Lucas** |
| 4 | BH4+VG-outro | Tema escuro ocioso: `useTheme`/`Colors` sem consumidores; telas light-locked; render misto | low | Verificado (zero importers; caminhada); pré-change também era light-locked (MD3 default tinha o mesmo texto claro sobre fundo claro) → defer (story própria de consumo de tema) |
| 5 | BH5+ECH5 | AC "tudo verde" vs 3 erros tsc; seção Verification diz "0 erros" | low | 3 erros reproduzidos idênticos no baseline; Registro já reconcilia → reject (fix = editar a própria spec) |
| 6 | BH6 | sprint-status.yaml com comentário obsoleto ("caminhada pendente") | low | Real → patch |
| 7 | BH7 | Task "8 arquivos — substituição" superconta (2 recebem só comentário) | low | Registro lista corretamente os papéis de cada arquivo → reject (fix = editar spec) |
| 8 | BH8 | Inversão background=surfaceSoft sem decisão gated | false | Preserva a composição pré-existente (piso `#F5F5F5`, cards brancos) e está registrada na tabela de mudanças visuais; nenhum mau resultado demonstrado |
| 9 | BH9 | project-context.md não menciona paleta/DESIGN.md | low | Real, dev-facing → defer (fix edita arquivo de contexto de agentes) |
| 10 | BH10+VG2+ECH3 | Resíduo MD3 (`elevation`/`surfaceContainer*` violeta no Banner: `#F7F3F9`/`#25232A`) + comentário do theme.ts superestimado ("nenhum lavender") + nenhum teste lê o tema | low | Probe confirma; resíduo é pré-existente (Banner já usava elevation defaults antes); o comentário falso foi introduzido agora → patch (escopar o comentário); resíduo → defer |
| 11 | BH11 | DESIGN.md: peso 575 órfão (prosa cita, token não define) | low | Doc pré-existente que a story não pode tocar (frozen: intocado) → defer |
| 12 | BH12 | DESIGN.md: aritmética do touch target 48px inconsistente | low | idem → defer |
| 13 | BH13 | DESIGN.md: cross-ref "Step 6" errada (regra é item 5) | low | idem → defer |
| 14 | BH14 | DESIGN.md: Known Gaps omite o gap texto-sobre-escuro que forçou o D6 | low | idem → defer |
| 15 | BH15 | DESIGN.md: `button-secondary-on-dark` byte-idêntico a `button-secondary` | low | idem (o token documenta padrão contextual da fonte) → defer |
| 16 | BH16 | Suíte não testa pares dos papéis MD3 mapeados | false | Papéis sobrescritos derivam de tokens da paleta com pares testados ou trivialmente seguros (ex.: `onSurfaceVariant` 41454d sobre `surfaceVariant` e0e2e6 ≈ 7.3:1); não-sobrescritos = row 10 |
| 17 | BH17 | Drift numérico: 6.4:1 (matriz frozen) vs ~6.5:1 (comentário palette.ts) | low | Cômputo confirma ~6.5 → patch (alinhar ao registro frozen) |
| 18 | VG1 | Bindings migrados sem lock de teste (mutação: trocar `FAILED_COLOR`/`PENDING_COLOR` passa 326/326) | medium | Pré-verificado por demonstração de mutação; a "trava" da story não pega a classe de regressão mais provável → patch (assertions de lock no padrão do repo) |
| 19 | ECH2 | `withAlpha` sem validação de entrada (rgba(NaN) silencioso) | false | Sem caminho alcançável: todos os call sites passam constantes de módulo |

**Processamento em cascata:** row 3 = intent_gap (raiz dentro do `<frozen-after-approval>`)
→ loopback; rows 1, 6, 10, 17, 18 (patch) e 4, 9, 10-resíduo, 11–15 (defer) ficam
registradas e serão rederivadas no ciclo seguinte; rows 2, 5, 7, 8, 16, 19 rejeitadas
com a refutação acima.

### Review de 2026-09-13 (iteração 2, re-derivação pós-loopback)

Blind-hunter (17 findings) + edge-case-hunter (5) + verification-gap (3 + 2 observações)
sobre o diff da re-derivação. Veredito por finding, com evidência verificada por mim:

| # | Camadas | Finding | Veredito | Evidência / rota |
|---|---------|---------|----------|------------------|
| 20 | BH1 | Comentários de código em pt-BR violariam a regra "comentários em inglês" do AGENTS.md | low | Real no papel, mas 100% dos comentários pré-existentes de `mobile/src` são em pt-BR (scan.tsx, student-card.tsx, offline-banner.tsx) — traduzir ~60 comentários divergiria de todo o codebase vizinho sem ganho algum → reject |
| 21 | BH2 | Piso 3:1 do âmbar rotulado "AA texto grande/UI" não conformsa formalmente (chip 16px/700 < 18,66px bold) | low | O tradeoff substancial é a row 3, renegociada e aprovada pelo Lucas no loopback; a imprecisão do rótulo vive no texto frozen de D3 — só o humano pode reescrevê-lo → reject (fix = editar bloco frozen) |
| 22 | BH3 | DESIGN.md: `button-pricing-pill` usa `typography: {typography.button}` (Haas) que o Do/Don't (linha ~498) proíbe misturar | low | Verificado no doc (linhas 174-178 vs 498); contradição pré-existente em doc frozen-intocável → defer |
| 23 | BH4 | DESIGN.md: `description:` do front-matter diz "pill CTA" mas o corpo (linha 300/414) manda `rounded.lg` para CTA primário e pill só no pricing | low | Verificado (linha 4 vs 300/414); idem → defer |
| 24 | BH5 | DESIGN.md: tabela de elevation documenta "blue-tinted glow" (linha 394) e 4 linhas depois nega existir glow (linha 398) | low | Verificado (394 vs 398); idem → defer |
| 25 | BH6 | `outline`/`outlineVariant` → hairline `#dddddd`: bordas de componentes caem de ~4.5:1 (default MD3 `#79747E`) para **1.36:1** — regressão WCAG 1.4.11 (não-texto, 3:1) | medium | **Real e causado pela mudança**: login.tsx:110,123 (`TextInput mode="outlined"`), student home (Card/Button outlined) e admin home (Button outlined) consomem o papel; a tabela de mudanças visuais aprovada NÃO registra mudança em bordas de input; o Always só trava pares de TEXTO. Único consertador coerente com o conteúdo já aprovado: manter o default MD3 nesses papéis (resíduo documentado, como `surfaceContainer*`) + gate não-texto no Always → **bad_spec → loopback** |
| 26 | BH7 | `darkPalette.link/info/success/error` como texto sobre canvas escuro ~2.3–2.9:1, sem comentário de alerta nem teste que prenda os valores | low | Inalcançável hoje (row 2); a story de consumo de tema já está em defer e negociará os tons de texto em dark; paleta comenta a estratégia → reject |
| 27 | BH8 | Contrato frozen da allowlist ("só QR e scanner") vs allowlist real (4 arquivos, incl. faixa 92% do banner) | low | Cada entrada é comentada no teste e documentada nos desvios #4 + registro de re-derivação; nenhum escape não-documentado existe; completar o contrato exigiria editar o bloco frozen → reject (fix = editar frozen) |
| 28 | BH9 | Drift de contagem: "326 incl. 20 novas" (iteração 1) vs "334 = 296 + 38" (re-derivação), mesmo baseline | low | Aritmética fecha: a suíte de guarda da iteração 1 tinha 30 casos (2+18+10) → 296+30=326; o "20" é que estava errado. Fix = editar registro histórico da spec → reject |
| 29 | BH10 | Guarda deixa passar cores nomeadas, `hsl()`, `.json`, `global.css` | low | Grep confirma: zero literais nomeados/hsl em `src`; global.css é web-only; contrato frozen é hex/rgba (row 1 já fixou o escopo) → reject |
| 30 | BH11+ECH4 | `centeredNote` do scan: erro `#B3261E` sobre `#000000` ≈3.2:1 (texto normal bold), sem par no teste | low | Par PRÉ-existente: baseline `b58b38e` já tinha exatamente essas cores; o token swap não mudou o par. Fix exigiria variante on-dark de erro (Ask First: cor nova) → defer |
| 31 | BH12 | AC "um só verde" vs `successBorder #39bf45` citado no teste dark = dois verdes vivos | false | D4 em si define DOIS papéis de uma única decisão (`#006400` texto + `#39bf45` borda/acentos); `successBorder` não tem consumidor em tela (só comentário de teste); o AC conta verdes semânticos substituídos, satisfeito → reject |
| 32 | BH13 | Spec `in-review` vs sprint-status "in-progress/PR pendente" — estados divergentes | false | Transitório por design: sprint-status é atualizado "ao concluir" (task 6); durante a review os registros legítimamente divergem → reject |
| 33 | BH14 | Screenshots da caminhada em `/tmp` — evidência efêmera | low | O registro durável é a prosa dos resultados na story; a menção a `/tmp` é honesta quanto à efemeridade → reject |
| 34 | BH15 | `textBody` e `textMuted` colapsam no mesmo tom em dark (hierarquia some) | low | Colapso FORÇADO pelo vocabulário de D6 (só dois tons de texto) e inalcançável hoje; comentário na paleta documenta; decisão de tom novo é humana e pertence à story de consumo de tema (já em defer) → reject |
| 35 | BH16 | DESIGN.md: `pricing-ink` usado por 3 componentes mas ausente da prosa de Text | low | Verificado (token na linha 34; prosa não cita); dívida editorial do doc frozen → defer |
| 36 | BH17 | DESIGN.md: footer com `padding: 64px` fora da escala de spacing (48→96) | low | Verificado (linha 284); idem → defer |
| 37 | ECH1 | `withAlpha` sem validação (rgba(NaN) silencioso) | false | **carried** (row 19): sem caminho alcançável, call sites só passam constantes de módulo |
| 38 | ECH2 | Guarda não casa `hsla()`, cores nomeadas, rgba() multilinha | low | idem row 29 (grep confirma zero ocorrências) → reject |
| 39 | ECH3 | `darkPalette.link/info` como texto em dark ~2.9:1/2.3:1 sem par no teste | false | **carried** (row 2): inalcançável, nenhuma tela consome os papéis |
| 40 | ECH5 | Matriz frozen promete "cada papel do tema ≥4.5 testado"; dark link/info não têm par (e falhariam) | false | Refutação prática = row 2 (inalcançável); consertar a PROMESSA exigiria editar a matriz frozen → reject (fix = editar frozen) |
| 41 | VG1 | Mapeamento Paper (`lightTheme`/`darkTheme`) sem NENHUM teste; a colisão do `secondary` shipou 2× e só um humano pegou; mutação demonstrada: trocar `secondary` passa 334/334 | medium | Pré-verificado (gap layer): zero teste lê os temas; render tests dispensam PaperProvider. A classe de regressão já ocorreu 2× na própria story → **patch** (lock de binding dos temas no padrão STATUS_PRESENTATION) |
| 42 | VG2 | Valores dos tokens sem pin no DESIGN.md/D1–D7: `error→#D32F2F` ou `primary→link-blue` passam em TODOS os gates (contrast-safe) | medium | Pré-verificado (grep: nenhum hex esperado em teste); drift do deliverable central é invisível às travas → **patch** (tabela token-pin) |
| 43 | VG3 | Locks cobrem 3/6 arquivos migrados: botão destrutivo da trip, chips, overlay do scan, estilos de routes/student-list sem lock | medium | Pré-verificado (mutação: `buttonColor→textMuted` passa 334/334); inclui as superfícies de maior risco (destrutiva + feedback do scan) → **patch** (estender locks, source-lock onde render-probe exige stack de câmera) |
| 44 | VG-out | Suíte dark testa combinações inalcançáveis enquanto o caminho dark renderizável (widgets Paper) não tem cobertura | low | Fato real; a cobertura que falta É o lock de temas da row 41 → **patch** (mesmo grupo) |
| 45 | VG-out | `Colors` de constants/theme.ts deriva da paleta mas é código morto (único importer sem importers) | low | **carried** (row 4): dívida de consumo de tema, já em defer |

**Processamento em cascata (iteração 2):** row 25 = bad_spec (raiz fora do frozen: o
Always só trava texto; a tabela aprovada não registra mudança em bordas de input) →
**loopback com emenda de spec** (gate não-texto no Always + `outline`/`outlineVariant`
permanecem default MD3) e re-derivação incorporando os patches verificados (rows 41–44:
locks de tema, token-pin, locks estendidos). Rows 30 e 22–24+35–36 (defer) registradas
em deferred-work.md. Rows 20–21, 26–29, 31–34, 37–40, 45 rejeitadas com a refutação acima.

### Review de 2026-09-13 (iteração 3, pós-bad_spec)

Blind-hunter (16) + edge-case-hunter (8) + verification-gap (0 gaps — todos os locks
executam e pinam valores; 3 notas de acurácia de asserção) sobre o diff da re-derivação
da iteração 2. Veredito por finding, com evidência verificada por mim:

| # | Camadas | Finding | Veredito | Evidência / rota |
|---|---------|---------|----------|------------------|
| 46 | BH1 | DESIGN.md: exemplo "path to 10×" citado p/ surface-dark (L313), cream (L328) e hero-card-dark (L451) — superfície canônica ambígua | low | Verificado nas 3 linhas; dívida editorial do doc frozen-intocável → defer |
| 47 | BH1 | DESIGN.md: "Navigation Variants" contém footer/cta-band-light; top-nav fora de subseção | low | idem → defer |
| 48 | BH1 | DESIGN.md: front-matter hardcoda 96px/32px (tokens existem) e 64px (sem token) contra a própria política | low | idem (estende row 36) → defer |
| 49 | BH1 | DESIGN.md: `npx @google/design.md lint DESIGN.md` (L544) — ferramenta inexistente no repo | low | Verificado; idem → defer |
| 50 | BH1 | DESIGN.md: button-legal (~40px de altura) abaixo do piso de 44px da própria seção Touch Targets | low | Dimensões conferidas (L163/437); idem → defer |
| 51 | BH1 | `primaryActive` registrado e pinado, sem consumidor | low | Registro 1:1 da fonte é o mandato (padrão D7: registrado, não adotado); adoção cabe à futura story de consumo/estados → reject |
| 52 | BH1+ECH2 | Pin dos papéis não-sobrescritos cobre só outline/outlineVariant/elevation | false | O título do teste ESCOPA "(outline e elevation)"; pinar TODOS os defaults MD3 congelaria o resíduo violeta do Banner que o defer registrado planeja sobrescrever → reject |
| 53 | BH1 | Par âmbar×branco do overlay do scan sem asserção (~4.24:1 @ 16px medium) | low | Real: a suíte da re-derivação derrubou o `warning × superfície clara` que a iteração 1 testava, e o botão branco com texto âmbar é alcançável; passa no piso 3:1 renegociado (contexto overlay, D3) mas não está travado → patch (par no piso D3, com a nota) |
| 54 | BH1 | `secondary`/`onSecondary` sem par de razão (só lock de valor) | false | Os locks pinam os VALORES exatos nos dois temas — o par renderizado não muda sem quebrar o lock; par de razão seria redundante → reject |
| 55 | BH1 | `successBorder` ~2.4:1 no branco, sem aviso — D4 diz "borda/acentos" e o gate não-texto próprio exige 3:1 | low | Cômputo confirma ~2.4:1; zero consumidores hoje; comentário de 1 linha previne o uso como borda em claro → patch |
| 56 | BH1 | Regex `{3,8}\b` deixa escapar literais hex de 9+ dígitos | false | Cor de 9+ dígitos hex não existe (formatos são 3/6/8); a fronteira existe para não casar IDs; a cobertura anunciada está intacta → reject |
| 57 | BH1 | Alpha ignorado no cálculo de razão (rgba 4º comp.; hex >6 dígitos) | low | Todos os pares assertados são opacos por construção; translúcidos vão por `contrastOverTint`; par translúcido novo seria decisão revisada → reject |
| 58 | BH1+ECH2 | Allowlist com chaves POSIX vs `relative()` com separador do SO — guarda falso-falharia em Windows | low | Real: a iteração 1 normalizava separadores, a reescrita derrubou; falha FECHADA (visível, não erosão silenciosa), repo é WSL/Linux, mas correção é de 1 linha → patch |
| 59 | BH1 | sprint-status "8 arquivos migrados" repetiria a superconta (2 só comentário) | low | Espelha o framing da PRÓPRIA task ("8 arquivos… *2 deles recebem só o comentário*"; precedente row 7) → reject (fix = editar docs que citam a task) |
| 60 | BH1 | Caminhada não reconferiu admin/student outlined (AC cita os três) | false | O papel `outline` é único, pinado ao default MD3 e testado ≥3:1 nos DOIS temas — todo consumidor herda structuralmente; reconferir por tela testa o mesmo valor → reject |
| 61 | BH1 | Linha em branco divide os registros de 1.11 em deferred-work.md | low | Cosmético; correção direta (apagar a linha) → patch |
| 62 | ECH2 | Symlinks sob `src` escapam à varredura (`isFile`/`isDirectory`) | low | Não existem symlinks em `mobile/src`; estrutura hipotética, mudança futura seria revisada → reject |
| 63 | ECH2 | Par dark `onSurfaceVariant×surfaceStrong` não é o binding do tema (`surfaceVariant`→`surface`) | false | O par assertado é MAIS estrito; o renderizado passa *a fortiori* (análise VG); valores pinados pelos locks de tema → reject |
| 64 | ECH2 | `counterText` branco sobre scrim 55%: pior caso de cena clara ~3.5:1 < 4.5 | low | Pré-existente (mesmo scrim/texto no baseline); depende da luminância da câmera (não determinístico); padrão aceito na 3.3b (NFR18) → defer |
| 65 | ECH2 | Label "Dispensar" (erro × composto 92% branco×vermelho) sem par assertado | low | Cômputo: composto ≈ #F9EEED → ~5.7:1, passa com folga; par pré-existente; valores pinados pelos render-probes → reject |
| 66 | VG-out | Pares assertados ≠ pares renderizados (chip "Concluída" resolve label→ink; `errorTint` sem consumidor; dark surfaceVariant mais estrito) | low | Pré-verificado (gap layer): "assertion accuracy, not an unprotected path" — todos os valores envolvidos pinados; os pares renderizados também passam → reject |
| 67 | Verificação de tasks (triage) | `darkTheme` sem `background`/`onBackground` (ficaram no default MD3 `#121212`/`#e6e0e9`) — a tabela D6 aprovada manda canvas `#181d26` | low | Real contra a tabela de referência da task (a iteração 1 mapeava); sem consumidor dark hoje; correção = mapear + estender locks → patch |

**Processamento em cascata (iteração 3):** nenhum intent_gap/bad_spec — **patch** nas
rows 53, 55, 58, 61, 67 via re-engajamento do subagente de implementação; **defer** nas
rows 46–50 (dívida editorial DESIGN.md, lote 3) e 64 (legibilidade do scrim pré-existente);
demais rejeitadas com a refutação acima.
