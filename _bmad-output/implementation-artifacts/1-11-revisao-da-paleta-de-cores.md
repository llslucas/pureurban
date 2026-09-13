---
title: 'Story 1.11: Revisão da Paleta de Cores — Unificação sobre o DESIGN.md (Airtable)'
type: 'feature'
created: '2026-09-13'
status: 'in-review'
review_loop_iteration: 1
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
| Tema escuro | paleta → tema Paper dark | conforme D6; nenhum token ilegível (ex.: `#41454d` sobre `#181d26`) | — |
| Contraste AA | par texto×fundo de cada papel do tema | ≥ 4.5:1 (≥ 3:1 para texto ≥ 18px), calculado no teste | teste lista os pares reprovados |
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
- `mobile/src/app/(driver)/student-list.tsx` -- `#1A1A2E`, `#208AEF`, `#FFFFFF`.
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

*Re-derivação pós-loopback (iteração 1) — tasks abaixo recomeçam abertas; o código foi
revertido ao baseline `b58b38e`. Além do escopo original, incorporam os patches
verificados na review (triage log rows 1, 6, 10, 17, 18):*

- [ ] `mobile/src/lib/palette.ts` -- módulo único: tokens do DESIGN.md + extensões
  aprovadas (D2/D3, com o piso 3:1 do âmbar renegociado) + derivação dos temas
  claro/escuro (D6). JSDoc mínimo apontando o DESIGN.md como fonte viva; comentário de
  contraste do erro alinhado ao registro frozen (`6.4:1`).
- [ ] `mobile/src/lib/theme.ts` + `mobile/src/constants/theme.ts` -- temas Paper e
  `Colors` derivando da paleta; eliminação dos neutros avulsos. O comentário do
  `theme.ts` fica ESCOPADO aos papéis sobrescritos (não afirmar "nenhum lavender do
  MD3" — `elevation`/`surfaceContainer*` permanecem default, resíduo pré-existente
  registrado no defer).
- [ ] 8 arquivos de tela/componente -- substituição dos ~25 hexes por tokens semânticos
  (famílias: marinho `#1A1A2E`→tinta; vermelhos→`#B3261E`; slate offline→família
  ink/body; verdes→`#006400`; pastéis→tintes alpha).
- [ ] `palette.guard.test.ts` -- (a) varredura de cor fora do módulo: hex `#RGB/#RRGGBB`
  **e `rgba()`/hex 8-dígitos**, com allowlist comentada (QR quiet zone, chrome de
  câmera de `qr-scanner.tsx` e `scan.tsx`, faixa branca 92% do `offline-banner.tsx` —
  cada uma com o porquê); (b) contraste AA dos pares do tema com o **âmbar no piso 3:1
  (D3 renegociado)**, pares anotados; (c) **locks de binding**: `STATUS_PRESENTATION`,
  `TONE_COLOR`, `PENDING_COLOR`/`FAILED_COLOR` presos aos papéis da paleta (a migração
  manual não pode trocar tokens silenciosamente — demonstrado por mutação na review).
- [ ] Roteiro de verificação visual no alvo web: login → motorista (trip, scan,
  student-list, routes) → aluno (home, QR) → banners (offline/stale) nos DOIS temas;
  mudanças visuais intencionais registradas na story. *(Já executada uma vez na review
  anterior — repetir na re-derivação.)*
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- entrada da 1.11
  atualizada ao concluir, com comentário refletindo o estado REAL (sem "pendente"
  obsoleto).
- [ ] `DESIGN.md` -- intocado (fonte viva; desvios documentados AQUI, não nele).

**Acceptance Criteria:**
- Given o app em qualquer tela, when os componentes resolarem cor, then a cor vem do
  módulo de paleta — zero hex semântico fora dele, provado pelo teste de guarda.
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
- `cd mobile && npx tsc --noEmit` -- expected: 0 erros.
- `cd mobile && npm run lint` -- expected: limpo.
- `grep -rEn "#[0-9A-Fa-f]{6}" mobile/src --include="*.tsx" --include="*.ts" |
  grep -v palette` -- expected: só allowlist (QR/scanner) e o módulo de paleta.
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
