# Epic 4 Context: Notificação de Ausência e Comunicação

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Este épico elimina a maior dor do produto — a espera indevida do motorista por aluno que não vai retornar. O aluno avisa "não vou voltar" com no máximo 2 toques, o motorista recebe a notificação em tempo real na lista de embarque (menos de 3 segundos), com contagem se ajustando automaticamente, e pode agir sem esperar em vão. O aluno que apertar por engano pode cancelar dentro de uma janela de segurança, e o sistema lembra in-app o aluno que embarcou na ida mas não confirmou o retorno (jornada da Ana). O título menciona "Comunicação", mas os avisos gerais do motorista (broadcast) foram cortados do MVP — o escopo efetivo é a notificação de ausência (FR26–FR30). O épico só está entregue quando os fluxos passam em E2E contra a API real.

## Stories

- Story 4.0: Contrato de API — Ausência e Comunicação
- Story 4.1: Registro de Ausência "Não Vou Voltar" (Fatia Vertical)
- Story 4.2: Canal SSE de Embarque e Recebimento em Tempo Real (Fatia Vertical)
- Story 4.3: Cancelamento de Ausência (Fatia Vertical)
- Story 4.4: Lembrete Automático de Check-in Pendente (Fatia Vertical)
- Story 4.5: E2E do Épico 4

## Requirements & Constraints

**Escopo funcional:** registro de ausência pelo aluno que fez check-in na ida (status passa a `NOT_RETURNING`); entrega em tempo real ao motorista, que vê o status do aluno mudar, a contagem resumida se ajustar e um toast contextual; cancelamento da ausência dentro de janela de segurança definida pelo servidor (`cancellableUntil` = `notifiedAt` + 2 min — o cliente nunca calcula essa janela, só exibe o countdown); lembrete automático in-app ao aluno que embarcou na ida e, após 15 minutos do início da viagem de retorno, não fez check-in nem registrou ausência. O lembrete é emitido no máximo uma vez por aluno por viagem, pelo canal SSE, e também é derivável do estado na abertura do app (para quem não estava conectado ao stream). Push notification e broadcast (FR36/FR37) estão fora do MVP.

**Validações e erros:** o use case valida que o aluno pertence à rota da viagem (`STUDENT_NOT_ON_TRIP`), que a viagem está ativa (`TRIP_NOT_ACTIVE`) e que não há ausência duplicada (`ALREADY_NOT_RETURNING`); cancelar fora da janela retorna `CANCELLATION_PERIOD_EXPIRED` — e a corrida entre o toque e a expiração é tratada com mensagem clara, sem travar a tela.

**Não-funcionais que guiam o design:** notificação entregue ao motorista em menos de 3s (medida contra a API real no E2E); fluxo "não vou voltar" em no máximo 2 toques, incluindo confirmação; interface do motorista operável com uma mão, botões grandes, alto contraste; toda query filtrada por `companyId`; apenas o motorista atribuído à rota abre o stream daquela viagem.

**Marco de entrega:** a Story 4.5 prova E2E os quatro fluxos (notificar, cancelar dentro da janela, rejeitar fora da janela, receber e responder o lembrete) e roda o drift check do `openapi.json`. Não há mocks a desligar — as fatias já são desenvolvidas contra a API local.

## Technical Decisions

**Fatiamento vertical (modelo dos Épicos 4 e 5):** uma fatia full-stack por FR (core Effect + shell NestJS + tela). A story de contrato `X.0` permanece pelo artefato `openapi.json` versionado + drift check, mas **sem handlers MSW** — todo desenvolvimento é contra a API local (`docker compose up` + `npm run start:dev`). Tipos do mobile continuam gerados de `api/openapi.json` — nunca escritos à mão. Guarda-corpo: fatia acima de ~8 ACs ou ~15 arquivos é dividida por camada, em sequência (backend, depois mobile contra a API local), dentro do mesmo épico — sem voltar à camada de mock.

**Bounded context:** tudo vive em `boarding` (schema PostgreSQL próprio, proibido JOIN cross-context; rota `/api/v1/boarding/*`). Use cases: registrar ausência, cancelar ausência, decidir quem deve ser lembrado. Entidades com `id` (UUID), `createdAt`, `updatedAt`, `companyId` e `@@schema("boarding")`. Datas ISO 8601 UTC na API.

**SSE + Redis Pub/Sub:** `GET /api/v1/boarding/events` é o stream do motorista; o controller faz subscribe no canal Redis Pub/Sub da viagem, múltiplos clientes compartilham o mesmo subscribe, e a conexão é encerrada elegantemente quando a viagem termina. O schema de cada evento SSE é contrato tanto quanto os endpoints REST: `boarding.not_returning`, `boarding.absence_cancelled`, `boarding.checkin_reminder` (que substituiu o antigo `boarding.broadcast`). No mobile, `EventSource` com reconexão automática após queda de rede, sem duplicar entradas na lista.

**Functional Core / Imperative Shell:** decisões de domínio (registrar, cancelar, quem lembretar) são use cases Effect puros, testáveis sem infraestrutura (< 100ms por suite), com **relógio injetado** para as regras de janela e do período de 15 min. Erros são tagged errors → HTTP `{ error: { code, message, details } }`; sucesso segue `{ data, meta }`. Eventos emitidos via `WithEvents`; o shell despacha via EventEmitter2 — `boarding.not_returning` e `boarding.absence_cancelled` alimentam a atualização da lista (contexto `trip`). O disparo do scheduler de lembretes é lógica do shell; a decisão de quem lembrar é do core, e o período é configuração do core.

**Idempotência e offline:** endpoints de escrita documentam o header `X-Idempotency-Key`. A fila offline Tier 2 (expo-sqlite, já construída no Épico 3) já prevê as operações `notify_not_returning` e `cancel_absence`. Regra de conflito com domínio (last-write-wins): o check-in do motorista presente tem autoridade sobre a notificação de ausência do aluno.

## UX & Interaction Patterns

- **Aluno — home (`(student)/home.tsx`):** botão "Não vou voltar" proeminente; confirmação incluída, fluxo ≤ 2 toques; após confirmar, estado "Ausência registrada" com countdown regressivo alimentado por `cancellableUntil`; botão "Cancelar" desaparece quando a janela expira e a ausência passa a ser apresentada como consolidada; cada erro tipado do contrato tem mensagem clara.
- **Aluno — lembrete in-app:** aviso em `(student)/home.tsx` com a ação "Não vou voltar"; responder pelo aviso produz exatamente os mesmos efeitos do botão da história de registro (mesma chamada, mesmo estado); quem abre o app depois do disparo vê o lembrete pendente sem ter estado conectado.
- **Motorista — lista (`(driver)/student-list.tsx`):** evento `boarding.not_returning` muda o status para "NÃO VAI VOLTAR" com destaque visual; contagem resumida se ajusta automaticamente (ex.: "28/32" → "28/31"); toast contextual anuncia a ausência sem bloquear a tela; `boarding.absence_cancelled` reverte status e contagem; reconexão automática sem duplicar entradas.
- Erros de negócio via toast/snackbar (React Native Paper); loading states via union types, nunca booleanos soltos.

## Cross-Story Dependencies

- **4.0 bloqueia todas:** nenhum endpoint ou evento aparece numa fatia sem estar declarado no contrato.
- **4.1** depende de 4.0; **4.3** depende de 4.1 (cancela o que 4.1 registra); **4.2** depende de 4.1 (o evento que o stream entrega nasce do registro) e da **3.5b** (a tela da lista do motorista já existe e é onde os eventos chegam); **4.4** depende de 4.2 (usa o mesmo canal SSE) e do modelo de check-in do Épico 3; **4.5** depende de 4.1–4.4 e é o marco demonstrável do épico.
- **Dependências externas:** Épico 3 concluído — modelo de viagem (ativa/encerrada, ida/retorno), check-in, lista com status `NOT_RETURNING` (o status já aparece no contrato da lista, mas só é escrito neste épico), e o fim da era MSW. A Story 1.9 (seed corrigido) precisa estar fechada antes do épico começar.
- **Para o Épico 5:** o padrão SSE + Redis Pub/Sub e o stream de eventos de embarque estabelecidos aqui são o precedente do stream de localização; o evento `boarding.checked_in` permanece interno ao backend.
