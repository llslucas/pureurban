---
workflowType: 'correct-course'
project_name: 'pureurban'
user_name: 'Lucas'
date: '2026-08-28'
status: 'aprovado'
approvedBy: 'Lucas'
approvedAt: '2026-08-28'
scope_classification: 'major'
inputDocuments: ['planning-artifacts/prd.md', 'planning-artifacts/architecture.md', 'planning-artifacts/epics.md', 'implementation-artifacts/sprint-status.yaml', 'implementation-artifacts/deferred-work.md']
---

# Sprint Change Proposal — Simplificação do Escopo de Front-end e Retorno ao Fatiamento Vertical

## 1. Resumo do Problema

### Gatilho

Pergunta do Lucas em 28/08/2026: *"o quanto podemos simplificar o front-end para agilizar a entrega?"*

Diferente das duas correções de curso anteriores, **esta não foi disparada por um defeito**. Foi disparada por uma conta de prazo. Nenhum artefato está errado; o plano está grande demais para o tempo que resta.

### Problema

Restam **~4 meses** até a entrega final (dezembro/2026) e **25 stories abertas**:

| Origem | Stories abertas |
|---|---|
| Épico 1 | 1.7 (build Android), 1.8 (seed sob Prisma 7) |
| Épico 3 | 3.1 (`review`), 3.3b (`in-progress`), 3.4b, 3.5b, 3.6 |
| Épico 4 | 12 (1 contrato, 5 backend, 5 mobile, 1 integração) |
| Épico 5 | 7 (1 contrato, 2 backend, 3 mobile, 1 integração) |

Dessas, **11 são de trilha mobile** e **3 são de integração**. O front-end é a maior fatia do que resta — e é justamente a parte que o PRD declara como **não sendo a tese**:

> *"o foco acadêmico é a documentação rigorosa da arquitetura do backend — utilizando Arquitetura Hexagonal, DDD em monolito modular, e separação entre functional core e imperative shell"* — `prd.md`, Sumário Executivo

Isso estabelece o critério de corte usado nesta proposta: **toda simplificação que preserve o fluxo demonstrável e não toque o functional core é gratuita em termos de valor acadêmico.**

### O segundo problema: um imposto que deixou de ter pagador

O fatiamento `X.0 / X.Ya / X.Yb / X.N` foi criado em 12/07/2026 (`sprint-change-proposal-2026-07-12`) com um objetivo explícito e único: **permitir que dois desenvolvedores trabalhassem em paralelo**. Os artefatos hoje se contradizem sobre quantos devs existem:

| Artefato | Afirmação |
|---|---|
| `prd.md:229` | "Recurso humano: **Desenvolvedor solo (Lucas)**" |
| `architecture.md:23` | "Recurso: **2 desenvolvedores (Lucas + 1)**" |
| `architecture.md:760` | "Estratégia de Onboarding do **Dev 2**" |
| `epic-2-retro-2026-05-11.md:135` | "Owner: Dev (Amelia / **quick-flow-solo-dev**)" |

**Confirmado com o Lucas em 28/08/2026: o projeto é solo** (Lucas + agentes). O PRD estava certo; a Architecture está desatualizada desde 12/07.

A consequência é direta. Para um dev solo trabalhando em sequência, a camada de mocks MSW é **imposto puro**: escrever handlers, mantê-los sincronizados com o contrato, e descartá-los na story `X.N` — tudo para simular uma API que sobe com `docker compose up`. O benefício que justificava o custo (a trilha mobile não esperar o backend) não existe quando as duas trilhas são a mesma pessoa.

E o imposto já está cobrando juros: `enableMocking()` não é idempotente e derruba o app no modo MSW (`deferred-work.md`, achado da Story 1.6, verificado em browser).

### O terceiro problema: um bloqueio sequenciado depois do que ele bloqueia

Achado durante esta análise, e o mais urgente dos três.

`mobile/src/app/_layout.tsx` **não renderiza saída de router** — não há `<Slot />`, `<Stack />` nem `<Tabs />`. Nenhuma tela do projeto é alcançável, autenticada ou não. Isso está verificado em browser real e registrado no `deferred-work.md` (achado da Story 1.6, 27/08/2026):

> não autenticado, `/login`, `/scan`, `/qr-code` e `/trip` devolvem tela em branco com 0 elementos interativos e **zero erro no console**; autenticado, todas renderizam "Welcome to Expo / GET STARTED".

O conserto está hoje **dentro da Story 3.6** — a story de integração, a **última** do Épico 3. Mas ele bloqueia a 3.3b, a 3.4b e a 3.5b, que vêm **antes**. O plano está sequenciado de trás para frente, e nenhuma story mobile pode fechar até isso ser resolvido.

O custo do conserto é desproporcionalmente baixo. Verificação de imports feita em 28/08/2026: o cluster de template do Expo é **auto-referencial** — nenhum arquivo de produto o importa, exceto `_layout.tsx`, que importa exatamente os dois componentes que fazem parte do bug.

| Arquivo | Linhas | Importado por código de produto? |
|---|---|---|
| `app/index.tsx` | 98 | não |
| `app/explore.tsx` | 181 | não |
| `components/animated-icon.tsx` + `.web.tsx` | 240 | só `_layout.tsx` (`AnimatedSplashOverlay`) |
| `components/app-tabs.tsx` + `.web.tsx` | 149 | só `_layout.tsx` |
| `components/themed-text.tsx` + `themed-view.tsx` | ~130 | só pelo próprio cluster |
| `components/ui/collapsible.tsx` | 65 | só `explore.tsx` |
| `components/hint-row.tsx` | 35 | só `index.tsx` |
| `components/web-badge.tsx` | 44 | só `index.tsx` / `explore.tsx` |
| `components/external-link.tsx` | 25 | só `explore.tsx` / `app-tabs.web.tsx` |
| **Total** | **~910** | **zero funcionalidade de produto** |

### Evidência

Todos os fatos acima vêm de artefatos versionados ou de verificação executada nesta sessão:

- Contagem de stories: `sprint-status.yaml` (atualizado 28/08/2026) + `epics.md` §Contagem de Stories.
- Contradição de recurso humano: linhas citadas acima, verificadas por `grep`.
- Nav shell quebrado: `deferred-work.md`, seção "Deferred from: dev of 1-6" — **observado em Chromium**, não deduzido por leitura.
- `enableMocking()` não idempotente: mesma seção, com causa raiz diagnosticada (Fast Refresh, não StrictMode).
- Cluster auto-referencial: `grep -rn` por cada componente em `mobile/src`, executado em 28/08/2026.
- Placeholders confirmados: `(driver)/student-list.tsx` e `(student)/track-bus.tsx` têm **9 linhas cada**.

---

## 2. Análise de Impacto

### Impacto nos Épicos

| Épico | Impacto | Natureza |
|---|---|---|
| **Épico 1** | +1 story (shell de navegação), 1 renumerada, 1.7 demovida de bloqueio para validação final | Sequenciamento |
| **Épico 2** | Nenhum (`done`) | — |
| **Épico 3** | Mantém contrato + MSW (já em voo). 3.4b enxugada, 3.6 perde o nav shell | Escopo pontual |
| **Épico 4** | 12 → 6 stories. Broadcast cortado, push substituído, fatiamento vertical | **Estrutural** |
| **Épico 5** | 7 → 4 stories. Mapa substituído, 5.3b dobrada, fatiamento vertical | **Estrutural** |

**Por que o Épico 3 não muda de modelo:** a Story 3.0 está `done`, os handlers MSW existem e a 3.3b está `in-progress` desenvolvida contra eles. Trocar o modelo no meio do épico seria retrabalho puro. O Épico 3 termina como começou.

### Impacto por Story

| Story | Antes | Depois |
|---|---|---|
| 1.7 | Bloqueio logo após 1.6 | **Validação final** (NFR5, NFR18–NFR20), antes da defesa |
| 1.8 | Corrigir seed sob Prisma 7 | **Renumerada para 1.9** (mesmo conteúdo, mesma posição: antes do Épico 4) |
| **1.8 (nova)** | — | **Shell de Navegação e Remoção do Template Expo** — executa a seguir |
| 3.4b | Fila + badge por item + teto 500 na UI | Fila + banner "Modo Offline". Badges e teto saem da UI |
| 3.6 | Integração E2E **+ nav shell + enableMocking** | Só integração E2E. Os dois consertos migram para a 1.8 |
| 4.0 | Contrato com broadcast + push token | Contrato sem broadcast, sem push token, sem handlers MSW |
| 4.1a + 4.1b | Duas stories | **4.1** — fatia vertical |
| 4.2a + 4.2b | Duas stories | **4.2** — fatia vertical |
| 4.3a + 4.3b | Duas stories | **4.3** — fatia vertical |
| 4.4a + 4.4b | Duas stories, push nativo | **4.4** — fatia vertical, lembrete in-app. Scheduler + use case do core preservados |
| 4.5a + 4.5b | Duas stories (broadcast) | **CORTADAS → Fase 2** |
| 4.6 | Integração (desligar mocks + E2E) | **4.5** — só E2E, não há mocks a desligar |
| 5.0 | Contrato com mock de stream sequencial | Contrato sem handlers MSW |
| 5.1a + 5.1b | Duas stories | **5.1** — fatia vertical |
| 5.2a + 5.2b + 5.3b | Três stories, mapa renderizado | **5.2** — fatia vertical, última posição + ETA, degradado incluído |
| 5.4 | Integração | **5.3** — só E2E |

**Saldo: 25 stories abertas → 18** (uma adicionada, oito removidas).
**Total do projeto: 42 → 34.**

### Conflitos de Artefato

| Artefato | Conflito | Severidade |
|---|---|---|
| `prd.md` §Escopo | Cronograma diz "Fase 1 ... maio/2026" — **quatro meses vencido**. "Fora do MVP" não lista broadcast, push completo nem mapa | Alta |
| `prd.md` FR30 | Diz "lembrete automático" sem prescrever push — **compatível** com a mudança. Só o meio de entrega muda | Baixa |
| `prd.md` FR32 | Diz "no mapa" — conflita com a substituição | Média |
| `prd.md` FR36/FR37 | Permanecem como requisitos de MVP | Alta |
| `architecture.md` §1 | "2 desenvolvedores (Lucas + 1)" — falso | Alta |
| `architecture.md` §3 | Tabela de ambientes trata o build Android como pré-requisito de push/GPS/Tier 2 | Média |
| `architecture.md` §8 regra 12 | Obriga toda story `X.Yb` a desenvolver contra MSW | Alta |
| `architecture.md` §8 regra 14 | Cita "a biblioteca de mapas do Épico 5, ainda não escolhida" — deixa de existir | Baixa |
| `architecture.md` §8 regra 15 | Lista push e Tier 2 como exigindo build Android | Média |
| `architecture.md` §9 | Diagrama do ciclo por épico assume duas trilhas paralelas | Alta |
| `architecture.md` §10 | Seção inteira ("Divisão de Trabalho — 2 Desenvolvedores") descreve um time que não existe | Alta |
| `architecture.md` §12 | Camada de mock declarada obrigatória; `boarding.broadcast` na tabela de eventos SSE | Alta |
| `epics.md` | Inventário de FRs, lista de épicos, convenção de fatiamento, 10 stories, 3 tabelas de rastreabilidade, 2 tabelas de contagem | Alta |
| `sprint-status.yaml` | Estrutura de stories dos Épicos 4 e 5; entradas do Épico 1 | Alta |
| `deferred-work.md` | 4 itens escopados para "Story 3.6" — dois migram para a 1.8 | Média |

### Impacto Técnico

**Código a remover:** ~910 linhas do template Expo (nenhuma referenciada por código de produto).

**Código a escrever (Story 1.8):** layout raiz com saída de router + redirect por `role`, e guarda de idempotência no `enableMocking()`. A causa raiz da segunda já está diagnosticada no `deferred-work.md` — **uma guarda de módulo (`let started = false`) não resolve**, porque o Fast Refresh reavalia o módulo e zera a flag; a guarda precisa ser ancorada no estado do servidor MSW (`if (server.listening) return`).

**Dependências que deixam de ser necessárias:** biblioteca de mapas (nunca escolhida — o risco fecha sem ser pago), `expo-notifications` + registro de push token.

**Dependência preservada:** `msw` continua em `mobile/` até o fim do Épico 3.

**O que NÃO é tocado:** functional core (Effect TS), arquitetura hexagonal, DDD/bounded contexts, schema Prisma multi-schema, Composition Root, domain events, multi-tenancy, SSE + Redis Pub/Sub, offline Tier 1 e Tier 2. **Zero impacto na tese.**

---

## 3. Caminho Recomendado

### Opções avaliadas

| Opção | Viável | Avaliação |
|---|---|---|
| **1. Ajuste direto** (modificar stories dentro do plano atual) | Parcial | Resolve o nav shell e a 3.4b, mas não resolve o volume: 25 stories em 4 meses continua sendo 25 stories |
| **2. Rollback** (reverter trabalho concluído) | ❌ Não | Nada entregue está errado. Não há o que reverter |
| **3. Revisão do MVP** (reduzir escopo) | ✅ **Sim** | É a única opção que ataca a causa real — volume de escopo de front-end contra prazo fixo |

**Selecionado: Opção 3 (Revisão do MVP), em híbrido com a Opção 1** para o nav shell e o resequenciamento do Épico 1.

Vale registrar o contraste: em 12/07/2026 a Opção 3 foi **explicitamente rejeitada** ("*O escopo não é o problema; o fatiamento é*"). Aquela avaliação estava correta para as premissas de julho — 2 devs, 5 meses. As premissas mudaram: o segundo dev não se materializou e restam 4 meses. A mesma opção agora é a certa.

### As seis mudanças aprovadas

Aprovadas pelo Lucas em 28/08/2026, antes da redação desta proposta:

1. **Modo solo confirmado** — camada MSW removida dos Épicos 4 e 5; fatiamento vertical full-stack por FR; a story de contrato `X.0` **permanece** pelo artefato `openapi.json` (valor de defesa + drift check no CI).
2. **Broadcast cortado** — 4.5a e 4.5b vão para a Fase 2. FR36/FR37 saem do MVP.
3. **Mapa substituído** — 5.2b entrega última posição conhecida + distância/ETA ao ponto do aluno, não cartografia.
4. **Push substituído** — 4.4b vira lembrete in-app. A 4.4a (scheduler + use case do core) é **preservada integralmente**.
5. **3.4b enxugada** (fila + banner, sem badges por item) e **5.3b dobrada** dentro da 5.2b.
6. **Story 1.7 demovida** de bloqueio para validação final.

**Item obrigatório, fora da lista de cortes:** extrair o conserto do nav shell da Story 3.6 para uma story própria (**1.8**), executada imediatamente. Não é simplificação — é pré-requisito de tudo o que vem depois.

### Por que cada corte é seguro

**Broadcast (FR36/FR37).** Não aparece em nenhuma das quatro jornadas do PRD. A própria mitigação de risco do PRD ordena a prioridade como *"Auth → CRUD rotas → QR check-in → Notificação → Real-time"* — broadcast está abaixo de todos. Remove 2 stories, 1 endpoint e 1 tipo de evento SSE.

**Mapa → posição + ETA.** A Jornada 1 do PRD descreve o valor assim:

> *"Carlos sai de casa e abre o app — vê que o ônibus está **a 3 pontos de distância, chegando em ~8 minutos**."*

Isso é **proximidade e tempo**, não cartografia. A substituição atende a jornada como ela está escrita. Elimina de uma vez o risco aberto da `architecture.md` §8 regra 14 (biblioteca de mapas compatível com web, nunca escolhida — `react-native-maps` não atende) e todo o trabalho de animação de marcador. O que o TCC demonstra no Épico 5 é **SSE + Redis Pub/Sub**, e isso fica intacto: mesmo endpoint, mesmo stream, mesmo evento `location.updated`.

**Push → lembrete in-app.** FR30 no PRD diz apenas *"Sistema envia lembrete automático"* — não prescreve push. O que muda é o meio de entrega, não o requisito. O lembrete passa a chegar pelo canal SSE já construído na 4.2 e pelo estado da viagem lido na abertura do app. A parte arquiteturalmente interessante — o scheduler no shell e o use case do core que decide *quem deve ser lembrado*, testável com relógio injetado — é preservada linha por linha. A jornada da Ana continua coberta.

**Fatiamento vertical nos Épicos 4 e 5.** Remove ~2 stories de puro overhead, elimina a manutenção dos handlers MSW e retira do caminho um bug já conhecido. A story de contrato sobrevive porque o `openapi.json` versionado + drift check no CI têm valor independente do paralelismo.

### O custo honesto desta mudança

Uma perda real, que precisa estar registrada e não escondida no meio da proposta.

A `architecture.md` §10 contém esta afirmação:

> *"a separação em trilhas transforma a afirmação 'a arquitetura hexagonal facilita trabalho paralelo em equipes pequenas' de hipótese teórica em **evidência coletável**"*

Voltando ao modo solo, essa evidência deixa de ser coletável nos Épicos 4 e 5.

**Reenquadramento proposto para a tese, que preserva — e talvez melhore — o material:** o Épico 3 executou integralmente sob o modelo de duas trilhas com contrato OpenAPI. Ele vira o **estudo de caso** da viabilidade do paralelismo. Os Épicos 4 e 5, executados sob fatiamento vertical, viram o **grupo de comparação**. O resultado deixa de ser uma afirmação de viabilidade e passa a ser uma observação comparativa sobre o custo da camada de mock para um desenvolvedor solo — mais defensável do que três épicos rodando sob o mesmo modelo sem termo de comparação.

### Riscos desta mudança

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| **Fatias verticais ficam grandes demais** para desenvolvimento assistido por agente. A Story 3.1 é o precedente: full-stack e ainda em `review` | Média | Médio | **Guarda-corpo:** se uma fatia vertical passar de ~8 ACs ou tocar mais de ~15 arquivos, ela é dividida por camada **dentro do mesmo épico** — sem voltar à camada MSW. A divisão vira sequencial (backend, depois mobile contra a API local), não paralela |
| Sem MSW, a trilha mobile passa a exigir o backend rodando | Alta | Baixo | `docker compose up` + `npm run start:dev` já é o fluxo documentado. A Story 1.9 (seed) precisa fechar antes do Épico 4 — já estava planejada assim |
| FR32 e FR30 mudam de forma e podem ser questionados na defesa | Baixa | Médio | Documentar as duas substituições na seção de limitações da tese, com a justificativa das jornadas do PRD. Ambos os FRs continuam **atendidos**, com meio de entrega diferente |
| Demover a 1.7 deixa NFR5 e NFR18–NFR20 sem verificação até tarde | Média | Médio | A 1.7 vira item **bloqueante da defesa**, não opcional. Fica no `sprint-status.yaml` com essa marca explícita |

### Impacto no cronograma

Redução de **~28% no volume de stories abertas** (25 → 18) e eliminação de duas dependências de risco não resolvidas (biblioteca de mapas, push nativo). O trabalho removido é integralmente de front-end e infraestrutura de mock. **Nenhuma story de functional core foi cortada.**

---

## 4. Propostas de Mudança Detalhadas

### 4.1 `planning-artifacts/prd.md` — aplicado

**(a) §Escopo → Estratégia de MVP — cronograma e recurso humano**

```
ANTES:
**Cronograma:**
- **Fase 1 (MVP/Protótipo):** ~2 meses (entrega fim do semestre — maio/2026) — protótipo utilizável
- **Fase 2 (Refinamento):** +6 meses (entrega final TCC — dezembro/2026) — documentação completa + polish

**Recurso humano:** Desenvolvedor solo (Lucas)

DEPOIS:
**Cronograma (revisado em 28/08/2026):**
- **Fase 1 (MVP/Protótipo):** Épicos 1 a 5 — entrega até novembro/2026
- **Fase 2 (Refinamento):** documentação completa, métricas e polish — entrega final TCC dezembro/2026

> O cronograma original (Fase 1 até maio/2026) não se concretizou. A revisão de 28/08/2026
> reduziu o escopo de front-end do MVP em vez de estender o prazo — ver
> `sprint-change-proposal-2026-08-28.md`.

**Recurso humano:** Desenvolvedor solo (Lucas) + agentes de IA. O segundo desenvolvedor
previsto na Architecture §10 não se materializou; o fatiamento em trilhas paralelas foi
revertido nos Épicos 4 e 5 em consequência disso.
```

**(b) §Escopo → Fase 1 — "Explicitamente fora do MVP"**

```
ANTES:
- Dashboard administrativo (Dona Márcia)
- Histórico de viagens e relatórios
- Push notifications complexas (pode usar básico)
- Gestão avançada de rotas
- Publicação em loja

DEPOIS:
- Dashboard administrativo (Dona Márcia)
- Histórico de viagens e relatórios
- **Push notifications (qualquer nível)** — o lembrete automático do FR30 é entregue in-app
- **Avisos gerais do motorista (broadcast) — FR36 e FR37**
- **Mapa cartográfico** — a localização é apresentada como última posição conhecida + ETA (FR32)
- Gestão avançada de rotas
- Publicação em loja
```

**(c) §Escopo → Fase 2 — acrescentar os itens diferidos**

```
DEPOIS (linhas acrescentadas):
- Avisos gerais do motorista — broadcast (FR36, FR37)
- Mapa cartográfico com marcador animado (evolução do FR32)
- Push notifications completas (evolução do FR30)
```

**(d) §Requisitos Funcionais → FR30 e FR32 — forma de entrega**

```
ANTES:
- **FR30:** Sistema envia lembrete automático ao aluno que embarcou na ida mas não fez check-in na volta após um período definido
- **FR32:** Aluno pode visualizar localização do ônibus em tempo real no mapa

DEPOIS:
- **FR30:** Sistema envia lembrete automático ao aluno que embarcou na ida mas não fez check-in na volta após um período definido. **No MVP o lembrete é entregue in-app** (canal SSE + estado lido na abertura do app); push notification fica para a Fase 2
- **FR32:** Aluno pode visualizar a localização do ônibus em tempo real. **No MVP a apresentação é a última posição conhecida com distância e tempo estimado até o ponto do aluno** — o mapa cartográfico fica para a Fase 2. A Jornada 1 ("o ônibus está a 3 pontos de distância, chegando em ~8 minutos") é atendida por esta forma
```

**(e) §Requisitos Funcionais → Comunicação (FR36, FR37) — marcar como diferidos**

```
ANTES:
### Comunicação

- **FR36:** Motorista pode enviar aviso geral para todos os alunos da rota (ex: atraso, mudança)
- **FR37:** Aluno recebe avisos enviados pelo motorista da sua rota

DEPOIS:
### Comunicação — **diferido para a Fase 2** (revisão de 28/08/2026)

- **FR36 (Fase 2):** Motorista pode enviar aviso geral para todos os alunos da rota (ex: atraso, mudança)
- **FR37 (Fase 2):** Aluno recebe avisos enviados pelo motorista da sua rota

> Não aparece em nenhuma das quatro jornadas do PRD e está abaixo de todas as
> prioridades listadas na Mitigação de Riscos. **Cobertura de FRs do MVP: 35/37.**
```

**Justificativa:** o cronograma estava quatro meses vencido; os cortes precisam estar declarados no documento que define o MVP, não só nos épicos.

---

### 4.2 `planning-artifacts/architecture.md` — aplicado

**(a) §1 → Contexto do Projeto**

```
ANTES:
- **Recurso:** 2 desenvolvedores (Lucas + 1) — MVP ~9 meses (dezembro/2026)

DEPOIS:
- **Recurso:** desenvolvedor solo (Lucas) + agentes de IA — MVP até novembro/2026, defesa em dezembro/2026
```

**(b) §3 → Ambiente de Execução e Validação (Mobile) — papel do build Android**

```
ANTES (linha da tabela):
| **Development build Android** (EAS) | `eas build -p android --profile development` | Validação nativa. Push, GPS, offline Tier 2 real, NFR5 e NFR18-NFR20 |

DEPOIS:
| **Development build Android** (EAS) | `eas build -p android --profile development` | **Validação final, antes da defesa.** NFR5 (boot < 3s) e NFR18-NFR20 (ergonomia, tela de 5"). Não é pré-requisito de nenhuma story de feature: push saiu do MVP, GPS usa a Geolocation API no web e o Tier 2 foi verificado em wa-sqlite/OPFS na Story 1.6 |
```

**(c) §8 → regras 12, 14 e 15**

```
ANTES (regra 12):
12. Toda story de trilha mobile (`X.Yb`) desenvolve contra os handlers MSW da story de contrato (`X.0`) — a trilha mobile NÃO depende do backend estar rodando até a story de integração (`X.N`)

DEPOIS:
12. **(histórico — vale apenas para o Épico 3)** Stories de trilha mobile (`X.Yb`) do Épico 3 desenvolvem contra os handlers MSW da Story 3.0. A partir do Épico 4 o projeto voltou ao fatiamento vertical e a camada de mock foi removida (§10): stories de feature são desenvolvidas contra a API local (`docker compose up` + `npm run start:dev`)
```

```
ANTES (regra 14, trecho final):
... Vale explicitamente para a biblioteca de mapas do Épico 5, ainda não escolhida

DEPOIS:
... A biblioteca de mapas do Épico 5 deixou de ser necessária na revisão de 28/08/2026 —
o FR32 é entregue como última posição + ETA, sem renderização cartográfica
```

```
ANTES (regra 15):
15. Nenhuma story mobile é considerada `done` sem execução verificada em pelo menos um dos dois ambientes da §3. Stories que dependem de recurso nativo (push, GPS, offline Tier 2) exigem o development build Android

DEPOIS:
15. Nenhuma story mobile é considerada `done` sem execução verificada em pelo menos um dos dois ambientes da §3. **Todas as stories de feature restantes são verificáveis no alvo web.** O development build Android (Story 1.7) é exigido apenas para NFR5 e NFR18-NFR20, na validação final antes da defesa
```

**(d) §9 → Fase de trilhas paralelas → renomear e substituir o ciclo**

~~~~
ANTES:
### Fase de trilhas paralelas (Épicos 3 → 4 → 5)
[diagrama do ciclo X.0 → X.Ya ∥ X.Yb → X.N]

DEPOIS:
### Fase de execução por épico (Épicos 3 → 4 → 5)

**Épico 3 — ciclo de trilhas paralelas (executado, mantido até o fim do épico):**
[diagrama original preservado, com nota "modelo histórico — Épico 3"]

**Épicos 4 e 5 — ciclo vertical (revisão de 28/08/2026):**

```
  X.0  Contrato de API (OpenAPI-first)
        │  DTOs + controllers stub (501) + Swagger + openapi.json + tipos gerados
        │  SEM handlers MSW — não há trilha paralela a desbloquear
        ↓
  X.1 … X.n  Fatias verticais por FR
        │  core Effect + shell + adapters + tela, na mesma story,
        │  desenvolvidas contra a API local
        ↓
  X.N  E2E do épico (mocks não existem — nada a desligar)
```

**Invariantes que sobrevivem:** a `X.0` continua bloqueante; nenhum endpoint ou evento SSE
entra numa fatia sem estar no contrato; o drift check no CI continua sendo o guardião do
`openapi.json`.

**Guarda-corpo de tamanho:** uma fatia vertical que passe de ~8 ACs ou toque mais de ~15
arquivos é dividida por camada **dentro do mesmo épico**, em sequência (backend, depois
mobile contra a API local) — nunca voltando à camada de mock.
~~~~

**(e) §9 → Trabalho transversal**

```
ANTES:
8. Push notifications (Expo Push API) — pode ser antecipado dentro do Épico 4 (Story 4.4a)

DEPOIS:
8. Push notifications (Expo Push API) — **diferido para a Fase 2**. No MVP o lembrete do FR30
   é entregue in-app pelo canal SSE do Épico 4
```

**(f) §10 → reescrita da seção**

```
ANTES:
## 10. Divisão de Trabalho (2 Desenvolvedores)
[duas trilhas, tabela Dev 1 / Dev 2, Estratégia de Onboarding do Dev 2, nota para a tese]

DEPOIS:
## 10. Modelo de Execução (Desenvolvedor Solo)

O segundo desenvolvedor previsto em 12/07/2026 não se materializou. Confirmado em
28/08/2026: o projeto é executado por um desenvolvedor solo (Lucas) apoiado por agentes
de IA. O fatiamento em trilhas paralelas — cujo **único** objetivo era o paralelismo —
foi revertido a partir do Épico 4.

**O que sai:** a camada de mock MSW como obrigação de processo, e a divisão de stories
por camada (`X.Ya` / `X.Yb`).

**O que fica:** o contrato OpenAPI-first (§12). O `openapi.json` versionado e o drift
check no CI têm valor independente do paralelismo — são a documentação viva da API e o
mecanismo que impede divergência silenciosa entre o código e o contrato publicado.

**O que muda no Épico 3:** nada. Ele executou inteiro sob o modelo de duas trilhas e
termina assim.

### Nota para a tese (revisada)

A afirmação original — "a arquitetura hexagonal facilita trabalho paralelo em equipes
pequenas" — deixa de ser verificável em três épicos e passa a ser verificável em um.
O reenquadramento preserva o material e melhora o desenho experimental:

- **Épico 3** = estudo de caso do modelo de trilhas paralelas com contrato OpenAPI.
- **Épicos 4 e 5** = grupo de comparação, sob fatiamento vertical.

O resultado deixa de ser uma afirmação de viabilidade e passa a ser uma **observação
comparativa** sobre o custo da camada de mock para um desenvolvedor solo — material mais
defensável, porque tem termo de comparação.
```

**(g) §11 → Gap Analysis**

```
ANTES:
- ⚠️ Ramp-up do Dev 2 em Effect TS: prever 3-4 semanas de curva de aprendizado

DEPOIS:
- ⚠️ Shell de navegação do mobile ausente (Story 1.8) — bloqueia toda verificação de story mobile
- ⚠️ Seed do banco quebrado sob Prisma 7 (Story 1.9) — bloqueia stories que dependem de dados semeados
```

**(h) §12 → escopo da camada de mock e tabela de eventos SSE**

```
ANTES (tabela de eventos SSE):
| 4 | `GET /api/v1/boarding/events` | `boarding.not_returning`, `boarding.absence_cancelled`, `boarding.broadcast` |

DEPOIS:
| 4 | `GET /api/v1/boarding/events` | `boarding.not_returning`, `boarding.absence_cancelled`, `boarding.checkin_reminder` |
```

```
ANTES (subseção):
### A camada de mock cobre stream, não só request/response
[exigência de mock de stream sequencial para 5.2b e 4.2b; "Se o mock de stream não emite sequências, a story X.0 não está concluída"]

DEPOIS:
### A camada de mock (histórico — Épico 3)

Esta subseção descreve uma exigência que valeu enquanto as trilhas eram paralelas.
A partir do Épico 4 a camada de mock foi removida (§10) e o `msw` deixa de ser
dependência obrigatória do fluxo: as telas de real-time são desenvolvidas contra o
stream SSE da API local.

O texto original fica preservado como registro do modelo aplicado ao Épico 3.
```

```
ANTES (Fluxo por épico, passos 4 e 5):
4. Mobile cria os handlers MSW ... a trilha mobile desenvolve sem backend rodando
5. Trilhas X.Ya (API) e X.Yb (Mobile) executam em paralelo ...

DEPOIS:
4. **(Épico 3 apenas)** Mobile cria os handlers MSW a partir do contrato.
5. **Épico 3:** trilhas `X.Ya` e `X.Yb` em paralelo.
   **Épicos 4 e 5:** fatias verticais `X.1 … X.n`, cada uma contra a API local.
```

**Justificativa:** a Architecture é o documento que as regras obrigatórias para agentes de IA referenciam. Deixá-la descrevendo um time de dois e uma camada de mock obrigatória faria os agentes reproduzirem o modelo revogado.

---

### 4.3 `planning-artifacts/epics.md` — aplicado

**(a) §Requirements Inventory → Comunicação**

```
ANTES:
**Comunicação:**
- FR36: Motorista pode enviar aviso geral para todos os alunos da rota (ex: atraso, mudança)
- FR37: Aluno recebe avisos enviados pelo motorista da sua rota

DEPOIS:
**Comunicação — diferido para a Fase 2 (revisão de 28/08/2026):**
- ~~FR36~~ *(Fase 2)*: Motorista pode enviar aviso geral para todos os alunos da rota
- ~~FR37~~ *(Fase 2)*: Aluno recebe avisos enviados pelo motorista da sua rota
```

Mesma nota de forma aplicada a FR30 e FR32 no inventário, espelhando o PRD.

**(b) §Epic List → Épicos 4 e 5**

```
ANTES (Épico 4):
Aluno pode avisar "não vou voltar" com um toque, motorista recebe instantaneamente, sistema envia lembrete automático — o maior problema (espera indevida) é eliminado. Motorista pode enviar avisos gerais.
**FRs cobertos:** FR26, FR27, FR28, FR29, FR30, FR36, FR37

DEPOIS:
Aluno pode avisar "não vou voltar" com um toque, motorista recebe instantaneamente, sistema envia lembrete automático in-app — o maior problema (espera indevida) é eliminado.
**FRs cobertos:** FR26, FR27, FR28, FR29, FR30 *(FR36 e FR37 diferidos para a Fase 2)*
```

```
ANTES (Épico 5):
Aluno vê o ônibus no mapa em tempo real ...

DEPOIS:
Aluno acompanha o ônibus em tempo real — última posição conhecida com distância e tempo
estimado até seu ponto — e o motorista transmite GPS automaticamente durante as viagens.
**FRs cobertos:** FR31, FR32, FR33, FR34, FR35
```

**(c) §Convenção de Fatiamento — escopo restrito ao Épico 3 + nova convenção**

```
DEPOIS (bloco acrescentado ao final da seção):
> **Revisão de 28/08/2026 (`sprint-change-proposal-2026-08-28`, aprovado):** esta convenção
> vale integralmente para o **Épico 3**, que executa até o fim sob ela. A partir do
> **Épico 4** o projeto voltou ao **fatiamento vertical**, porque o segundo desenvolvedor
> não se materializou e o paralelismo — único motivo da convenção — deixou de existir.
>
> | Sufixo | Épico 3 | Épicos 4 e 5 |
> |---|---|---|
> | `X.0` | contrato + tipos + handlers MSW | contrato + tipos, **sem MSW** |
> | `X.Ya` / `X.Yb` | duas trilhas paralelas | **não se aplica** |
> | `X.n` | — | fatia vertical por FR (core + shell + tela) |
> | `X.N` | integração: desligar mocks + E2E | **E2E apenas** |
>
> Guarda-corpo: fatia vertical acima de ~8 ACs ou ~15 arquivos é dividida por camada,
> em sequência, dentro do mesmo épico — nunca voltando à camada de mock.
```

**(d) Épico 1 — Story 1.7 reescrita, Story 1.8 nova, Story 1.9 renumerada**

```
STORY 1.7 — alteração no rodapé:
ANTES: **Camada:** Infraestrutura · **Depende de:** 1.6 · **FRs:** habilitador · **Desbloqueia:** 4.4b, 5.1b, 5.2b, NFR5, NFR18-NFR20
DEPOIS: **Camada:** Infraestrutura · **Depende de:** Épico 5 concluído · **FRs:** habilitador ·
        **Desbloqueia:** NFR5, NFR18-NFR20 · **Momento:** validação final, antes da defesa —
        não bloqueia nenhuma story de feature (revisão de 28/08/2026)
```

```
STORY NOVA — inserida imediatamente após a 1.6:

### Story 1.8: Shell de Navegação e Remoção do Template Expo

Como desenvolvedor,
Quero que o app monte um navegador funcional e roteie por papel de usuário,
Para que as telas do produto sejam alcançáveis e as stories mobile possam ser verificadas.

**Acceptance Criteria:**

**Given** `mobile/src/app/_layout.tsx` sem `<Slot />`, `<Stack />` nem `<Tabs />` — nenhuma tela
alcançável em nenhum estado de autenticação (verificado em Chromium na Story 1.6)
**When** implemento o shell de navegação
**Then** o layout raiz renderiza saída de router e as rotas `(auth)`, `(driver)`, `(student)` e
`(admin)` são alcançáveis pela barra de endereços no alvo web
**And** o usuário autenticado é roteado para o grupo correspondente ao seu `role`, tanto no
login novo quanto na reabertura com sessão hidratada do MMKV
**And** o usuário não autenticado é roteado para `(auth)/login` sem tela em branco
**And** `enableMocking()` torna-se idempotente por guarda ancorada no estado do servidor MSW
(`server.listening`) — uma guarda de módulo NÃO resolve, porque o Fast Refresh reavalia o
módulo e zera a flag (diagnóstico registrado no `deferred-work.md`)
**And** o cluster de template do Expo é removido: `app/index.tsx`, `app/explore.tsx`,
`components/animated-icon*`, `components/app-tabs*`, `components/themed-text`,
`components/themed-view`, `components/ui/collapsible`, `components/hint-row`,
`components/web-badge`, `components/external-link` e os assets órfãos — ~910 linhas sem
nenhum importador de produto
**And** `npx expo export --platform web` continua completando sem erro
**And** a AC #5 da Story 3.2b (fluxo de 1 toque até o QR, NFR19) passa a ser demonstrável
**And** as ACs #4, #5 e #7 da Story 1.6, fechadas como diferidas, são verificadas e fechadas

**Camada:** Infraestrutura · **Depende de:** 1.6 · **FRs:** habilitador ·
**Desbloqueia:** 3.3b, 3.4b, 3.5b, 3.6 e toda story mobile subsequente
```

```
STORY RENUMERADA:
1.8 (Corrigir seed do banco sob Prisma 7) → **1.9**, conteúdo e posição inalterados
(executa antes do Épico 4). A renumeração é gratuita: a story está em `backlog` e ainda
não tem arquivo criado.
```

**(e) Épico 3 — Stories 3.4b e 3.6**

```
STORY 3.4b — ACs removidas:
ANTES: **And** cada item da fila exibe badge de estado (`✓` sincronizado, `⏳` pendente, `✗` falhou)
       **Then** o check-in é enfileirado ... FIFO por `created_at`, limite de 500 itens
DEPOIS: (badge por item removido; o limite de 500 permanece como regra da fila, mas deixa de
        ter representação na interface)

Nota acrescentada à story:
> **Revisão de 28/08/2026:** a interface da fila foi enxugada para banner global
> ("Modo Offline — dados serão sincronizados", NFR13). O mecanismo da fila, a idempotência
> e a persistência a crash (NFR11, NFR12, NFR14) são preservados integralmente — é o que
> demonstra o Tier 2 da Architecture §5.
```

```
STORY 3.6 — escopo reduzido:
Nota acrescentada:
> **Revisão de 28/08/2026:** o shell de navegação e a idempotência do `enableMocking()`,
> antes escopados para esta story, migraram para a **Story 1.8**. A 3.6 passa a ser
> exclusivamente a integração e o E2E do épico.
```

**(f) Épico 4 — reescrita da composição**

```
ANTES: **Composição:** 12 stories (1 contrato, 5 backend, 5 mobile, 1 integração).
DEPOIS: **Composição:** 6 stories (1 contrato, 4 fatias verticais, 1 E2E).
```

| Nova | Substitui | Mudança de conteúdo |
|---|---|---|
| **4.0** Contrato | 4.0 | Remove `POST /boarding/broadcast`, o evento `boarding.broadcast`, o endpoint de registro de push token e a exigência de handlers MSW. **Acrescenta** o evento `boarding.checkin_reminder` |
| **4.1** Ausência "Não Vou Voltar" | 4.1a + 4.1b | União das ACs |
| **4.2** Canal SSE e Recebimento em Tempo Real | 4.2a + 4.2b | União das ACs |
| **4.3** Cancelamento de Ausência | 4.3a + 4.3b | União das ACs |
| **4.4** Lembrete Automático de Check-in Pendente | 4.4a + 4.4b | Scheduler + use case do core **preservados**. Entrega por `boarding.checkin_reminder` no stream + estado lido na abertura do app. Sem push token, sem notification actions |
| **4.5** E2E do Épico 4 | 4.6 | Remove "desligar mocks" e o cenário de broadcast |
| ~~4.5a, 4.5b~~ | — | **Removidas — Fase 2** |

```
Rastreabilidade FR → Story (Épico 4) — DEPOIS:
| FR26 | 4.1 |
| FR27, FR28 | 4.2 |
| FR29 | 4.3 |
| FR30 | 4.4 |
| ~~FR36, FR37~~ | Fase 2 |
**Cobertura do épico: 5/5 FRs de MVP (FR26–FR30).**
```

**(g) Épico 5 — reescrita da composição**

```
ANTES: **Composição:** 7 stories (1 contrato, 2 backend, 3 mobile, 1 integração).
DEPOIS: **Composição:** 4 stories (1 contrato, 2 fatias verticais, 1 E2E).
```

| Nova | Substitui | Mudança de conteúdo |
|---|---|---|
| **5.0** Contrato | 5.0 | Remove a exigência de handlers MSW com sequência de eventos |
| **5.1** Ingestão e Transmissão de GPS | 5.1a + 5.1b | União das ACs. `expo-location` usa a Geolocation API no alvo web |
| **5.2** Acompanhamento do Ônibus em Tempo Real | 5.2a + 5.2b + 5.3b | SSE do backend + tela do aluno. **Mapa substituído por última posição + distância/ETA ao ponto do aluno.** Marcador animado removido. Comportamento degradado ("Sem sinal GPS" após 15s, FR34) incorporado |
| **5.3** E2E do Épico 5 | 5.4 | Remove "desligar mocks" |

```
Rastreabilidade FR → Story (Épico 5) — DEPOIS:
| FR31, FR33 | 5.1 |
| FR32, FR34 | 5.2 |
| FR35 | 5.1 (Redis + Pub/Sub) + 5.2 (SSE) |
**Cobertura do épico: 5/5 FRs (FR31–FR35).**
```

**(h) §Validação de Cobertura Total e §Contagem de Stories**

```
Cobertura — DEPOIS:
| Epic 4 | FR26–FR30 | 5 |
| **Total MVP** | | **35/37** |
| **Diferido (Fase 2)** | FR36, FR37 | 2 |

Contagem — DEPOIS:
| Epic 1 | 7 | 9  | +1.8 (shell de navegação) e 1.9 (seed) |
| Epic 3 | 9 | 9  | intocado em contagem; 3.4b e 3.6 reduzidas em escopo |
| Epic 4 | 12 | 6 | fatiamento vertical + broadcast cortado |
| Epic 5 | 7 | 4  | fatiamento vertical + 5.3b dobrada na 5.2 |
| **Total** | **42** | **34** | **−8 stories** |
```

---

### 4.4 `implementation-artifacts/sprint-status.yaml` — aplicado

```yaml
# === Epic 1 ===
  1-6-ambiente-de-execucao-web-do-app-mobile: done
  # NOVA (sprint-change-proposal-2026-08-28): extraída da Story 3.6. Bloqueia toda
  # verificação de story mobile — executa a seguir.
  1-8-shell-de-navegacao-e-remocao-do-template-expo: backlog
  # Renumerada de 1-8 para 1-9. Conteúdo e posição inalterados: antes do Épico 4.
  1-9-corrigir-seed-do-banco-sob-prisma-7: backlog
  # Demovida de bloqueio para validação final (sprint-change-proposal-2026-08-28):
  # push saiu do MVP, GPS usa Geolocation API no web, Tier 2 verificado em wa-sqlite
  # na Story 1.6. Resta NFR5 e NFR18-NFR20. BLOQUEIA A DEFESA, não o desenvolvimento.
  1-7-development-build-android-para-validacao-nativa: backlog

# === Epic 4 (reestruturado — 12 → 6 stories) ===
  epic-4: backlog
  4-0-contrato-de-api-ausencia: backlog
  4-1-registro-de-ausencia-nao-vou-voltar: backlog
  4-2-canal-sse-e-recebimento-em-tempo-real: backlog
  4-3-cancelamento-de-ausencia: backlog
  4-4-lembrete-automatico-de-check-in-pendente: backlog
  4-5-e2e-do-epico-4: backlog
  epic-4-retrospective: optional
  # REMOVIDAS — diferidas para a Fase 2: 4-5a e 4-5b (broadcast, FR36/FR37)

# === Epic 5 (reestruturado — 7 → 4 stories) ===
  epic-5: backlog
  5-0-contrato-de-api-localizacao: backlog
  5-1-ingestao-e-transmissao-de-gps: backlog
  5-2-acompanhamento-do-onibus-em-tempo-real: backlog
  5-3-e2e-do-epico-5: backlog
  epic-5-retrospective: optional
```

Cabeçalho de sufixos atualizado para registrar que a convenção `X.Ya`/`X.Yb` vale só para o Épico 3.

---

### 4.5 `implementation-artifacts/deferred-work.md` — aplicado

Quatro itens hoje escopados para "Story 3.6" são reescopados:

| Item | Novo escopo |
|---|---|
| Layout raiz não renderiza saída de router | **Story 1.8** |
| `enableMocking()` não idempotente | **Story 1.8** |
| AC #5 da 3.2b não demonstrável (nav shell) | **Story 1.8** (fecha por consequência) |
| Ratificação do `eslint` + `eslint-config-expo` no mobile | **Story 1.8** (o lint roda sobre o código que sobrar) |

Item novo a registrar:

> **Diferido pela revisão de escopo de 28/08/2026** — Fase 2: broadcast do motorista
> (FR36/FR37, ex-stories 4.5a/4.5b), push notifications (evolução do FR30) e mapa
> cartográfico com marcador animado (evolução do FR32).

---

## 5. Handoff de Implementação

**Classificação de escopo: Major** — revisão do MVP com remoção de FRs, reestruturação de dois épicos e mudança do modelo de execução. Exige envolvimento de PM e Arquiteto, não apenas reorganização de backlog.

Justificativa da classificação: dois FRs saem do MVP, dois mudam de forma de entrega, e a §10 da Architecture é reescrita. Nenhum código entregue é invalidado e nenhuma decisão arquitetural estrutural é revertida — mas o contrato do produto muda, e isso é escopo de PM.

### Sequência

| # | Ação | Responsável | Bloqueia |
|---|---|---|---|
| 1 | ~~Aplicar as edições da §4~~ — **concluído em 28/08/2026** | PM (John) | — |
| 2 | Criar a story `1-8-shell-de-navegacao-e-remocao-do-template-expo.md` (`bmad-create-story`) | SM / PO | 3 |
| 3 | Implementar a Story 1.8 (`bmad-dev-story`) | Dev | 4, 5, 6 |
| 4 | Verificar a 3.3b em execução e fechá-la | Dev | Épico 3 |
| 5 | Fechar a 3.1 (pendente em `review`) | Dev | Épico 3 |
| 6 | Retomar o Épico 3: 3.4b (enxuta) → 3.5b → 3.6 | Dev | Épico 4 |
| 7 | Story 1.9 (seed sob Prisma 7) | Dev | Épico 4 |
| 8 | Épico 4 reestruturado: 4.0 → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 | Dev | Épico 5 |
| 9 | Épico 5 reestruturado: 5.0 → 5.1 → 5.2 → 5.3 | Dev | 10 |
| 10 | Story 1.7 (build Android) — validação final de NFR5 e NFR18-NFR20 | Dev | Defesa |

### Critérios de sucesso

- **Story 1.8:** `/login`, `/trip`, `/scan`, `/qr-code` e `/home` alcançáveis pela barra de endereços no alvo web, com redirect correto por `role` tanto no login novo quanto na reabertura com sessão hidratada. O modo MSW sobe sem `Invariant Violation`. `npx expo export --platform web` continua verde.
- **Épico 3:** fecha com 3.1, 3.3b, 3.4b, 3.5b e 3.6 em `done`, todas com evidência de execução (Architecture §8, regra 15).
- **Épico 4:** 5 FRs de MVP cobertos (FR26–FR30); nenhum handler MSW criado; `openapi.json` sem drift.
- **Épico 5:** 5 FRs cobertos (FR31–FR35); nenhuma dependência de biblioteca de mapas adicionada.
- **Guarda-corpo:** nenhuma fatia vertical passa de ~8 ACs ou ~15 arquivos sem ser dividida por camada.
- **Story 1.7:** NFR5 medido em emulador Android; NFR18-NFR20 verificados em tela de 5".
- **Tese:** o Épico 3 é documentado como estudo de caso do modelo de trilhas paralelas, e os Épicos 4 e 5 como grupo de comparação sob fatiamento vertical.

### Rastreabilidade das decisões

Todas as seis mudanças da §3 foram aprovadas pelo Lucas em 28/08/2026, em resposta a duas perguntas estruturadas (recurso humano; conjunto de cortes autorizados). O item obrigatório do nav shell foi identificado durante esta análise e apresentado como pré-requisito, não como opção.
