---
workflowType: 'correct-course'
project_name: 'pureurban'
user_name: 'Lucas'
date: '2026-08-23'
status: 'aprovado'
approvedBy: 'Lucas'
approvedAt: '2026-08-23'
scope_classification: 'moderate'
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md', 'planning-artifacts/epics.md', 'implementation-artifacts/sprint-status.yaml']
---

# Sprint Change Proposal — Ambiente de Execução do App Mobile

## 1. Resumo do Problema

### Gatilho

Durante a tentativa de executar o app mobile no Expo Go de um iPhone, em 23/08/2026, descobriu-se que **não existe hoje nenhum ambiente onde o app mobile do PureUrban possa ser executado**. A pergunta original era se a versão do Expo SDK deveria ser reduzida para compatibilizar com o Expo Go instalado no aparelho.

O gatilho já havia deixado uma marca no sprint antes de ser nomeado: a **Story 3.3b (Escaneamento de QR Code)** está `in-progress` no `sprint-status.yaml` e no arquivo da story, apesar de o código estar implementado e os achados de code review fechados no commit `c36dd69`. Ela não fecha porque não há onde executá-la. É a primeira story do projeto que exige a câmera — e portanto a primeira que exige rodar o app de verdade.

### Problema

O ambiente de execução assumido pelo PRD e pela Architecture — o **Expo Go** — é incompatível com a stack decidida pela própria Architecture.

O `react-native-mmkv` v4 depende de **Nitro Modules**, código nativo ausente do binário do Expo Go. Não é uma questão de versão de SDK: o MMKV nunca esteve no Expo Go, em nenhuma versão. E não é uma dependência periférica — está no caminho de boot do app:

| Arquivo | Papel |
|---|---|
| `mobile/src/lib/storage.ts` | Instância raiz + tokens de autenticação |
| `mobile/src/stores/auth.store.ts` | Estado de sessão |
| `mobile/src/services/api-client.ts` | Injeção de token nas requisições |
| `mobile/src/lib/mmkv-persister.ts` | Persistência do TanStack Query (offline Tier 1) |
| `mobile/src/app/_layout.tsx` | Root layout |
| `mobile/src/app/(auth)/login.tsx` | Tela de login |

No Expo Go a falha ocorre em `_layout.tsx` — tela branca antes do login.

A premissa entrou no PRD em 14/03/2026 (`prd.md`, Requisitos Mobile: *"Distribuição via Expo Go ou build de desenvolvimento"*), foi replicada na Architecture em 15/03 (§1: *"Distribuição: Expo Go / build de dev"*) e **sobreviveu a duas revisões sem nunca ter sido testada**. A decisão do MMKV (Architecture §3, Story 1.5) e a premissa do Expo Go conviveram em contradição por cinco meses porque nenhuma seção da Architecture era responsável por definir onde o mobile roda.

### Restrições do ambiente do desenvolvedor

Windows/WSL, sem macOS, sem device Android físico, sem conta Apple Developer Program. O Expo Go do iPhone parou de receber atualizações na App Store, travando-o numa versão de SDK antiga.

### Evidência

1. `react-native-mmkv@4.3.0` + `react-native-nitro-modules@0.35.3` no `mobile/package.json`, usados em 6 arquivos do caminho de boot.
2. `npx expo export --platform web` executado em 23/08/2026 — falha em **um único ponto**:

   ```
   node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm
     Import stack: src/lib/database.ts → src/app/_layout.tsx
   ```

   Causa: **`mobile/metro.config.js` não existe**. O Metro não resolve `.wasm` como asset.
3. Suporte web verificado nas dependências instaladas:
   - `react-native-mmkv/src/createMMKV/createMMKV.web.ts` — implementação sobre `localStorage` ✅
   - `expo-camera/build/web/useWebBarcodeScanner.js` + `WebBarcodeScanner` via `getUserMedia` ✅
   - `expo-sqlite/build/ExpoSQLite.web.js` sobre wa-sqlite (WASM/OPFS) ⚠️ requer config do Metro
4. O projeto **já trata web como alvo de primeira classe**: `app.json` declara `web.output: "static"`, e existem `app-tabs.web.tsx`, `animated-icon.web.tsx`, `use-color-scheme.web.ts` e um componente `WebBadge`.

### Alternativa descartada: reduzir a versão do SDK

Avaliada e rejeitada. Não resolve o bloqueio — o MMKV continua ausente do Expo Go em qualquer versão — e arrastaria React Native 0.83.2 → 0.81.x, React 19.2 → 19.1, os 15 pacotes `expo-*` fixados em `~55.x`, `eslint-config-expo` e o React Compiler (`app.json`, `experiments.reactCompiler`). Custo alto, retorno nulo.

---

## 2. Análise de Impacto

### Impacto nos Épicos

| Épico | Status | Impacto |
|---|---|---|
| **Épico 1** | `done` → `in-progress` | Reaberto. A fundação não estava completa: a Story 1.5 configurou MMKV, expo-sqlite, Zustand, TanStack Query e Paper, mas nenhuma story definiu onde isso executa. Recebe as stories 1.6 e 1.7 |
| **Épico 2** | `done` | Nenhum. Backend puro |
| **Épico 3** | `in-progress` | **Bloqueado da 3.3b em diante.** 4 stories dependem de ambiente de execução |
| **Épico 4** | `backlog` | Parcial. 4 das 5 stories mobile são cobertas pelo alvo web; a 4.4b (push) exige build nativo |
| **Épico 5** | `backlog` | Parcial + **risco novo** na escolha da biblioteca de mapas |

### Impacto por Story

| Story | Alvo web cobre? | Observação |
|---|---|---|
| 3.3b Escaneamento de QR Code | ✅ | `useWebBarcodeScanner` via `getUserMedia` (webcam) |
| 3.4b Check-in offline (fila SQLite) | ⚠️ Parcial | wa-sqlite/WASM sobre OPFS — API idêntica, substrato distinto do SQLite nativo |
| 3.5b Lista de alunos e status | ✅ | |
| 3.6 Integração e E2E do Épico 3 | ✅ | |
| 4.1b / 4.2b / 4.3b / 4.5b | ✅ | `EventSource` é nativo no browser — SSE funciona melhor no web que no React Native |
| **4.4b Push notification** | ❌ | Expo Push não opera no alvo web. Exige development build |
| 5.1b Transmissão de GPS | ⚠️ Parcial | `navigator.geolocation` aproxima, mas não valida `expo-location` nem captura em background |
| **5.2b Mapa em tempo real** | ❌ Risco | Nenhuma biblioteca de mapas está no `package.json`. A escolha passa a carregar uma restrição inexistente antes: suporte web ou variante `.web.tsx` |

**NFRs não validáveis no alvo web:** NFR5 (boot < 3s em Android 8+), NFR18 (operação com uma mão), NFR19 (máximo 2 toques), NFR20 (tela 5" a 720p).

### Conflitos de Artefato

| Artefato | Conflito |
|---|---|
| `prd.md` (Requisitos Mobile) | *"Distribuição via Expo Go ou build de desenvolvimento"* — premissa falsa desde 14/03/2026 |
| `prd.md` (Requisitos Mobile) | *"Push notifications: Via Expo Push Notifications"* — passa a depender de build nativo, pré-requisito não declarado |
| `architecture.md` §1 | *"Distribuição: Expo Go / build de dev (sem loja)"* — mesma premissa |
| `architecture.md` | **Lacuna estrutural:** nenhuma seção define o ambiente de execução e validação do mobile. Causa-raiz do bloqueio |
| `epics.md` Story 1.5 | Story de setup mobile (`done`) não incluiu ambiente de execução. Não é falha da story — o critério nunca foi escrito |
| `sprint-status.yaml` | `epic-1: done` incorreto dada a lacuna |

### Impacto Técnico

- **Nenhuma linha de código de aplicação é descartada ou reescrita.** O problema é de configuração e de ambiente.
- A correção mínima é `mobile/metro.config.js`: `resolver.assetExts` com `wasm` + headers COOP/COEP no dev server (exigidos pelo `SharedArrayBuffer` do wa-sqlite).
- CI/CD (previsto na Architecture, ainda não implementado) ganha um alvo natural: `expo export --platform web` como smoke test de bundle — teria detectado este erro automaticamente.

---

## 3. Caminho Recomendado

**Selecionado: Híbrido — Ajuste Direto (principal) + nota de escopo.**

| Opção | Viável? | Esforço | Risco | Avaliação |
|---|---|---|---|---|
| **1. Ajuste Direto** | ✅ | Baixo | Baixo | Duas stories habilitadoras + correção de premissa em PRD/Architecture |
| **2. Rollback** | ❌ | — | — | Não há o que reverter. Trocar MMKV por AsyncStorage seria rollback da Story 1.5, violaria regra crítica do `project-context.md` e ainda dependeria de um Expo Go travado |
| **3. Revisão de MVP** | ⚠️ Parcial | Baixo | Médio | O escopo não muda. Mas NFR5, NFR18-NFR20 e a Story 4.4b ganham um pré-requisito de infraestrutura antes indeclarado |

**Justificativa:** o gatilho não invalida nenhuma decisão arquitetural, nenhum requisito funcional e nenhuma linha de código entregue. É uma premissa de ambiente que entrou errada e nunca foi testada. O custo de corrigir é aproximadamente 15 linhas de configuração mais duas stories de infraestrutura; o custo de não corrigir é o Épico 3 travado indefinidamente.

**Impacto no MVP:** nenhuma redução de escopo. Cobertura de FRs permanece **37/37**.

**Impacto no cronograma:** Story 1.6 é de configuração pura (estimativa: horas). Story 1.7 envolve setup de Android Studio e EAS (estimativa: 1 dia). Ambas destravam trabalho hoje bloqueado — o efeito líquido no prazo de dezembro/2026 é positivo.

**Decisão sobre o build nativo:** a Story 1.7 entra como **story planejada logo após a 1.6**, não diferida. Razão: 4.4b e 5.2b são impraticáveis sem ela, e quanto mais tarde chegar, mais stories acumulam verificadas apenas no browser.

---

## 4. Propostas de Mudança Detalhadas

### 4.1 `planning-artifacts/prd.md` — aplicado

Seção *Requisitos Específicos por Tipo de Projeto → Requisitos Mobile*:

- Linha de **Publicação** dividida: removida a menção ao Expo Go como via de distribuição.
- Novo item **Ambiente de execução**, declarando o Expo Go como alvo inviável e definindo os dois ambientes complementares (alvo web para o ciclo diário; development build Android para validação nativa).
- Item **Push notifications** passa a registrar a dependência do development build.

Nenhum FR, NFR, meta ou critério de sucesso alterado.

### 4.2 `planning-artifacts/architecture.md` — aplicado

- **§1 Visão Geral & Restrições:** `Distribuição` reescrita para *"Development build (EAS, sem loja) … Expo Go não é alvo"*.
- **§3 Decisões Arquiteturais:** nova subseção **"Ambiente de Execução e Validação (Mobile)"**, com a justificativa técnica da incompatibilidade, a tabela dos dois ambientes e a tabela de substituições nativo → web (MMKV/`localStorage`, expo-sqlite/wa-sqlite, expo-camera/`getUserMedia`).
- **§8 Regras Obrigatórias:** três regras novas.

  | # | Regra |
  |---|---|
  | 14 | Toda dependência mobile nova DEVE ter suporte web declarado ou variante `.web.tsx`/`.web.ts` antes de ser adotada. Vale explicitamente para a biblioteca de mapas do Épico 5 |
  | 15 | Nenhuma story mobile é `done` sem execução verificada em pelo menos um dos dois ambientes. Stories com recurso nativo (push, GPS, offline Tier 2) exigem o development build |
  | 16 | `expo export --platform web` DEVE fazer parte da pipeline de CI como smoke test de bundle |

- **Frontmatter:** `revisedAt: '2026-08-23'` e `revisionNotes` acrescida.

Nenhuma decisão estrutural alterada: stack, bounded contexts, tiers de offline, divisão de trabalho e contrato OpenAPI permanecem intactos.

> A regra 14 é a que impede a repetição do padrão. Hoje ela pegaria a escolha da biblioteca de mapas do Épico 5 antes de virar bloqueio, exatamente como deveria ter pego a adoção do MMKV.

### 4.3 `planning-artifacts/epics.md` — aplicado

**Story 1.6: Ambiente de Execução Web do App Mobile** — nova. Configuração pura, zero código de aplicação. Critérios: `metro.config.js` com `wasm` em `assetExts` e headers COOP/COEP; `expo export --platform web` sem erro; login ponta a ponta; MMKV sobre `localStorage` com cache sobrevivendo a reload; expo-sqlite abrindo em wa-sqlite/OPFS; leitura de QR via webcam em `(driver)/scan.tsx`; README documentado.
*Depende de: 1.5 · Desbloqueia: 3.3b, 3.4b, 3.5b, 3.6*

**Story 1.7: Development Build Android para Validação Nativa** — nova. Critérios: `expo-dev-client` + `eas.json` com profile `development`; APK instalável em emulador no Windows via `adb reverse`; MMKV nativo e SQLite nativo operando; QR pela câmera do emulador; NFR5 medido; sem necessidade de conta Apple ou macOS.
*Depende de: 1.6 · Desbloqueia: 4.4b, 5.1b, 5.2b, NFR5, NFR18-NFR20*

**Story 5.2b** — critério acrescentado: a biblioteca de mapas escolhida deve ter suporte web ou variante `.web.tsx` (Architecture §8, regra 14); `react-native-maps` não atende.

**Contagem de stories:** Épico 1 de 5 → 7; total de 39 → 41. Cobertura de FRs inalterada em 37/37.

### 4.4 `implementation-artifacts/sprint-status.yaml` — aplicado

- `epic-1: done` → `in-progress`, com comentário registrando o motivo da reabertura.
- Adicionadas `1-6-ambiente-de-execucao-web-do-app-mobile: backlog` e `1-7-development-build-android-para-validacao-nativa: backlog`.
- `epic-1-retrospective` permanece `done`, anotada como cobrindo as stories 1.1-1.5.
- Comentário no Épico 3 registrando que a 3.3b em diante está bloqueada pela Story 1.6, e que o código da 3.3b já está implementado e revisado (`c36dd69`), faltando apenas verificação em execução.
- **A Story 3.3b permanece `in-progress`.** Ela não é `done` porque genuinamente ainda não foi executada — marcá-la como concluída agora seria exatamente o registro otimista que a nova regra 15 passa a proibir.

Nenhuma edição em `deferred-work.md`: aquele arquivo registra deferrals de code review, e a decisão aqui foi planejar, não diferir.

---

## 5. Handoff de Implementação

**Classificação de escopo: Moderate** — reorganização de backlog com atualização de artefatos de planejamento. Não há replan fundamental: nenhuma decisão arquitetural, nenhum FR e nenhum código entregue foram invalidados.

### Sequência

| # | Ação | Responsável | Bloqueia |
|---|---|---|---|
| 1 | Criar a story `1-6-ambiente-de-execucao-web-do-app-mobile.md` (`bmad-create-story`) | SM / PO | 2 |
| 2 | Implementar a Story 1.6 (`bmad-dev-story`) | Dev | 3, 4 |
| 3 | Verificar a Story 3.3b em execução no alvo web e fechá-la | Dev | Épico 3 |
| 4 | Criar e implementar a Story 1.7 | Dev | Épico 4 |
| 5 | Retomar o Épico 3 pela Story 3.4b | Dev | — |

A Story 3.1, ainda em `review`, permanece pendente de `bmad-code-review` — independente desta mudança.

### Critérios de sucesso

- `npx expo export --platform web` completa sem erro.
- `npm run web` sobe o app e o login autentica contra a API local.
- A leitura de QR code da Story 3.3b é verificada em execução, e a story fecha.
- `epic-1` volta a `done` somente após 1.6 e 1.7 concluídas.
- Nenhuma story mobile futura é marcada `done` sem execução verificada (Architecture §8, regra 15).
