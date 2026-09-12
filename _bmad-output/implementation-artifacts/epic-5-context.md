# Epic 5 Context: Localização em Tempo Real

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Este épico elimina a ansiedade de espera no ponto: o aluno acompanha o ônibus em tempo real — última posição conhecida com distância e tempo estimado até o seu ponto (a Jornada 1 do produto descreve o valor como "a 3 pontos de distância, chegando em ~8 minutos": proximidade e tempo, não cartografia) — e o motorista transmite GPS automaticamente, sem ação manual, durante as viagens. Para a tese, é a demonstração do pipeline SSE + Redis Pub/Sub, que deve permanecer intacto ponta a ponta. O épico só está entregue quando os fluxos passam em E2E contra a API real.

> **Restruturado em 2026-08-28** (change proposal aprovado): 7 stories → 4. O mapa cartográfico com marcador animado virou última posição + distância/ETA (Fase 2 fica com o mapa); a antiga story de comportamento degradado foi dobrada na Story 5.2; e a story de contrato passou a entregar apenas DTOs, Swagger, `openapi.json` e tipos gerados — **sem handlers MSW**.

## Stories

- Story 5.0: Contrato de API — Localização em Tempo Real
- Story 5.1: Ingestão e Transmissão de GPS (Fatia Vertical)
- Story 5.2: Acompanhamento do Ônibus em Tempo Real (Fatia Vertical)
- Story 5.3: E2E do Épico 5

## Requirements & Constraints

**Escopo funcional:** o app do motorista transmite GPS automaticamente enquanto a viagem está ativa e para de transmitir quando ela é encerrada — a captura é amarrada ao ciclo de vida da viagem, nunca a um toque manual, e o GPS não é coletado fora de viagem ativa (privacidade de localização). O aluno vinculado à rota vê a posição do ônibus atualizar em tempo real; quando o sinal GPS cai, o sistema mantém o último ponto conhecido visível com aviso claro, em vez de dado stale silencioso. Posição enviada para viagem não ativa é rejeitada (`TRIP_NOT_ACTIVE`); consulta sem posição armazenada retorna `NO_LOCATION_AVAILABLE`. Apenas o motorista atribuído à viagem envia coordenadas e apenas alunos vinculados à rota abrem o stream — herança direta das regras de permissão e multi-tenancy.

**Não-funcionais que guiam o design:** entrega da atualização de localização ao aluno com latência máxima de 5s, medida contra a API real no E2E; estado degradado claro ("Sem sinal GPS" após ~15s sem eventos, com recuperação automática quando voltam); tela utilizável em dispositivo de 5" e 720p.

**Marco de entrega:** a Story 5.3 prova E2E o caminho feliz (viagem inicia → GPS transmite → aluno vê posição e ETA atualizando) e o degradado (sem eventos → indicador → recuperação), verifica o fim limpo da transmissão ao encerrar a viagem e roda o drift check do `openapi.json`. Não há mocks a desligar.

## Technical Decisions

**Fatiamento vertical (modelo dos Épicos 4 e 5):** uma fatia full-stack por FR (core Effect + shell NestJS + tela), desenvolvida contra a API local (`docker compose up` + `npm run start:dev`). A story de contrato `X.0` permanece pelo artefato `openapi.json` versionado + drift check, mas **sem handlers MSW**. Tipos do mobile são gerados de `api/openapi.json` — nunca escritos à mão. Guarda-corpo: fatia acima de ~8 ACs ou ~15 arquivos é dividida por camada, em sequência, dentro do épico — sem voltar à camada de mock.

**Superfície de API (definida na 5.0, vale para o épico inteiro):** `POST /api/v1/tracking/location` recebe as coordenadas do motorista; `GET /api/v1/tracking/trips/:id/stream` é o SSE do aluno; `GET /api/v1/tracking/trips/:id/location` devolve o último ponto conhecido — estado inicial da tela antes do primeiro evento e o que fica visível quando o sinal cai. Nenhum endpoint ou evento entra numa fatia sem estar declarado no contrato.

**Pipeline de real-time:** REST do motorista → posição no Redis (TTL curto, sobrescrita contínua) → Redis Pub/Sub publica `location.updated` → SSE controller faz streaming para os alunos inscritos. Múltiplos alunos na mesma viagem compartilham o mesmo subscribe; a conexão SSE é encerrada elegantemente quando a viagem termina. **Posições não são persistidas no PostgreSQL** — histórico de trajeto está fora do escopo do MVP; dado de localização é naturalmente substituível (last-write-wins puro).

**Eventos:** o schema do evento SSE `location.updated` é contrato, no mesmo nível dos endpoints REST — o shape não muda sem revisão de contrato. Os domain events internos `trip.started` / `trip.ended` (emitidos pelo contexto `trip` desde o Épico 3) são o gatilho de iniciar/parar a transmissão no `tracking` e não são contrato de cliente.

**Functional Core / Imperative Shell:** a lógica de ingestão é use case Effect puro, com o Redis atrás de uma port do core — testável sem infraestrutura real (< 100ms por suite). Erros tagged → HTTP `{ error: { code, message, details } }`; sucesso segue `{ data, meta }`. Tudo vive no bounded context `tracking` (schema Prisma próprio, proibido JOIN cross-context).

**Mobile:** `expo-location` para GPS (no alvo web opera pela Geolocation API do browser) e `EventSource` com reconexão automática com backoff após queda de rede. Nenhuma biblioteca de mapas é adicionada — a dependência foi eliminada pela reestruturação.

## UX & Interaction Patterns

- **Aluno — `(student)/track-bus.tsx`:** carrega o último ponto conhecido via endpoint REST e depois atualiza via SSE. A apresentação é a última posição com **distância e tempo estimado até o ponto do aluno** — texto/status, não mapa. Sem eventos por ~15s: mantém o último ponto com o indicador "Sem sinal GPS"; quando os eventos voltam, o indicador some e a tela atualiza. Viagem encerrada: mensagem "Nenhuma viagem ativa no momento" e conexão SSE fechada elegantemente.
- **Motorista — captura invisível:** quando a viagem passa a `ACTIVE`, a captura começa sozinha (5s entre envios); ao encerrar, para sozinha. A permissão de localização é solicitada com justificativa clara antes da primeira viagem. Perda temporária de rede não derruba a captura: posições velhas são descartadas (não têm valor) e o envio retoma sozinho.
- Interface operável em tela pequena (5", 720p), seguindo os padrões visuais React Native Paper já estabelecidos.

## Cross-Story Dependencies

- **5.0 bloqueia todas:** nenhum endpoint ou evento entra numa fatia sem estar no contrato; 5.1 depende de 5.0; **5.2 depende de 5.1** (precisa de posições reais fluindo para consumir o stream); **5.3** depende de 5.1 + 5.2 e é o marco demonstrável do épico.
- **Dependências externas:** Épico 4 concluído (pré-requisito da 5.0); modelo de viagem do Épico 3 (ciclo ativa/encerrada, ida/retorno e os eventos `trip.started`/`trip.ended` que ligam e desligam o GPS); vínculos motorista-rota e aluno-rota do Épico 2, que definem quem pode transmitir e quem pode assistir. O padrão SSE + Redis Pub/Sub e o `sse-client` estabelecidos no Épico 4 são reutilizados aqui.
- **Não depende do build Android:** toda story deste épico é verificável no alvo web (Geolocation API); a Story 1.7 (development build) vem depois, como validação final de NFRs antes da defesa.
