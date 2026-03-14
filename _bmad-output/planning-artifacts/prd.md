---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments: []
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: 'mobile_app + api_backend'
  domain: 'edtech_transport'
  complexity: 'medium'
  projectContext: 'greenfield'
---

# Product Requirements Document - pureurban

**Author:** Lucas
**Date:** 2026-03-14

## Sumário Executivo

O PureUrban é uma plataforma mobile (Expo/React Native) com API backend (NestJS) que digitaliza a gestão de embarque e comunicação entre motoristas e alunos universitários no transporte intermunicipal fornecido por prefeituras e empresas de transporte. O sistema substitui o processo manual de carteirinhas físicas e grupos de WhatsApp por um fluxo digital de check-in/check-out, notificações estruturadas e visibilidade operacional da frota.

O produto atende uma lacuna específica do mercado brasileiro: alunos adultos de cidades do interior que dependem de transporte de terceiros para acessar faculdades em outras cidades. Diferentemente das soluções existentes de transporte escolar — focadas na relação escola-pais para crianças (K-12) — o PureUrban opera na dinâmica **aluno adulto ↔ motorista ↔ empresa de transporte**, onde a comunicação direta e a autonomia do aluno são centrais.

O modelo de negócio é B2B2C: empresas de transporte e prefeituras são os clientes pagantes, beneficiando-se da eficiência operacional e redução de reclamações; alunos e motoristas são os usuários finais, beneficiando-se da praticidade e comunicação direta.

O projeto serve simultaneamente como **Trabalho de Conclusão de Curso (TCC) em Engenharia de Software**, onde o foco acadêmico é a documentação rigorosa da arquitetura do backend — utilizando **Arquitetura Hexagonal** (COCKBURN, 2005), **Domain-Driven Design** (EVANS, 2003) em monolito modular, e separação entre **functional core** (Effect TS) e **imperative shell** (NestJS), fundamentado no padrão **Functional Core, Imperative Shell** (BERNHARDT, 2012).

### O Que Torna Este Produto Especial

- **Problema real validado em primeira mão**: O fundador é um aluno que vive a dor diariamente — motoristas esperando alunos que já foram embora, carteirinhas esquecidas, comunicação caótica via WhatsApp.
- **Nicho negligenciado**: Transporte universitário intermunicipal em cidades do interior não possui solução tecnológica dedicada. As soluções existentes focam em transporte escolar infantil urbano.
- **Arquitetura como diferencial acadêmico**: O backend demonstra integração entre programação funcional pura (Effect TS) e framework orientado a objetos (NestJS) coexistindo sem acoplamento, com domínios isolados via DDD — um caso de estudo concreto para o TCC.
- **Modelo B2B2C claro**: O cliente paga pela eficiência operacional; o usuário ganha praticidade. Incentivos alinhados.

## Classificação do Projeto

| Dimensão | Valor |
|---|---|
| **Tipo** | Mobile App (Expo/React Native) + API Backend (NestJS) |
| **Domínio** | Transporte Educacional (EdTech/Logística) |
| **Complexidade** | Média |
| **Contexto** | Greenfield |
| **Modelo de Negócio** | B2B2C |
| **Contexto Acadêmico** | TCC em Engenharia de Software |

## Critérios de Sucesso

### Sucesso do Usuário

**Aluno:**
- Embarque digital via QR code em menos de 5 segundos, eliminando a dependência de carteirinhas físicas.
- Visualização da localização do ônibus em tempo real, reduzindo a incerteza sobre horários de chegada.
- Notificação de "não vou voltar" com um toque — eliminando a necessidade de ligar ou mandar mensagem no WhatsApp.

**Motorista:**
- Lista digital de alunos por viagem com status de embarque atualizado automaticamente — sem necessidade de contar carteirinhas ou verificar assentos.
- Recebimento imediato de notificações quando um aluno informa que não retornará, permitindo partida sem espera indevida.
- Eliminação de atrasos de 30 a 60 minutos causados por alunos que vão embora sem avisar e não atendem ligações.

### Sucesso do Negócio

**Empresa de Transporte / Prefeitura:**
- Eliminação da espera indevida por alunos que não retornam, com meta de redução de 90%+ nos atrasos por esse motivo.
- Diminuição significativa de reclamações de alunos relacionadas a comunicação e tempo de espera.
- Visibilidade em tempo real da localização da frota, permitindo intervenção e suporte ao motorista quando necessário.
- Digitalização completa do controle de embarque, substituindo o processo manual de carteirinhas.

### Sucesso Técnico (TCC)

- **Acoplamento:** Módulos de domínio (functional core via Effect TS) testáveis isoladamente, sem dependência do NestJS ou infraestrutura.
- **Qualidade de código:** Métricas mensuráveis de coesão e acoplamento demonstrando a eficácia da arquitetura hexagonal — referenciado em métricas como *Instability* e *Abstractness* (MARTIN, 2003).
- **Velocidade de desenvolvimento:** Evidência de que a separação functional core / imperative shell permite testes unitários de domínio rápidos (< 100ms por suite) sem setup de infraestrutura.
- **Prova de conceito funcional:** MVP operacional demonstrando o fluxo completo de embarque digital, notificação e rastreamento.
- **Aderência arquitetural:** Demonstração prática dos padrões Arquitetura Hexagonal (COCKBURN, 2005), DDD (EVANS, 2003) e Functional Core/Imperative Shell (BERNHARDT, 2012).

### Resultados Mensuráveis

| Métrica | Situação Atual | Meta com PureUrban |
|---|---|---|
| Tempo de espera por aluno ausente | 30-60 min | < 2 min (notificação imediata) |
| Processo de embarque | Manual (carteirinha física) | Digital (QR code, < 5s) |
| Comunicação motorista-aluno | WhatsApp (caótico, sem garantia) | In-app (estruturada, rastreável) |
| Visibilidade da frota | Nenhuma | Tempo real via GPS |
| Testes de domínio (TCC) | N/A | Executáveis sem infraestrutura |

## Jornadas do Usuário

### Jornada 1: Carlos, o Aluno — "Só quero chegar e voltar sem estresse"

**Persona:** Carlos, 22 anos, estudante de Administração. Mora em uma cidade do interior e depende do ônibus da prefeitura para ir à faculdade em uma cidade vizinha. Aulas noturnas, sai de casa por volta das 17h.

**🔴 Hoje (Sem PureUrban):**

Carlos sai de casa e caminha até o ponto de ônibus. Não sabe se o ônibus já passou ou está atrasado — checa o grupo do WhatsApp, mas ninguém respondeu. Fica ansioso. O ônibus chega 10 minutos depois; ele entrega sua carteirinha ao motorista e toma um assento. O ônibus segue pelos demais pontos coletando outros alunos até sair da cidade. Chegando na faculdade, desce do ônibus.

Após as aulas, vai até o ponto de retorno. Pega de volta sua carteirinha e espera dentro do ônibus. Uma colega do mesmo ônibus decide ir embora com uma amiga de carro, mas esquece a carteirinha no ônibus. O motorista espera. Liga para a colega — não atende. Pede que outros alunos tentem contato. 40 minutos se passam até que descobrem que ela já foi embora. Carlos chega em casa quase meia-noite, irritado.

**🟢 Com PureUrban:**

Carlos sai de casa e abre o app — vê que o ônibus está a 3 pontos de distância, chegando em ~8 minutos. Sem ansiedade. Quando o ônibus chega, aproxima o celular e faz check-in via QR code em 3 segundos. Sem carteirinha física.

Na volta, faz check-in novamente pelo QR code. A colega que foi embora com a amiga? Abriu o app e tocou "Não vou voltar" — o motorista recebeu a notificação instantaneamente na sua lista. Nenhuma espera. O ônibus parte no horário. Carlos chega em casa às 23h, como deveria.

---

### Jornada 2: Seu João, o Motorista — "Preciso saber quem está e quem não está"

**Persona:** João, 48 anos, motorista de ônibus há 15 anos. Responsável por uma turma de 38 alunos universitários na rota interior → cidade universitária. Conhece muitos alunos pelo nome, mas a rotatividade semestral dificulta.

**🔴 Hoje (Sem PureUrban):**

João inicia a rota passando nos pontos. Em cada ponto, alunos entregam suas carteirinhas — ele as empilha no painel. Chegando na faculdade, tem uma pilha de ~30 carteirinhas. Na volta, os alunos pegam suas carteirinhas de volta. Ele monitora a pilha: quando esvaziar, pode partir. Os mais atentos como João fazem um double-check visual nos assentos.

Hoje sobraram 2 carteirinhas. Liga para o primeiro aluno — atende, está na biblioteca, chega em 5 minutos. O segundo não atende. Pede que colegas liguem. Nada. Liga para Dona Márcia, a administradora de plantão, que também tenta contato. 45 minutos depois, Dona Márcia autoriza a partida. João sai frustrado, preocupado se tomou a decisão certa, e os outros 28 alunos no ônibus estão irritados com o atraso.

**🟢 Com PureUrban:**

João inicia a viagem no app. Em cada ponto, alunos fazem check-in via QR code — a lista atualiza automaticamente. Ele vê: "28/32 embarcados". Sem carteirinhas para contar.

Na volta, a lista mostra: "30/32 retornaram". As duas ausências? Uma aluna tocou "Não vou voltar" há 20 minutos — João já sabia. O outro aluno acabou de notificar pelo app. Lista completa. João parte no horário, tranquilo. Dona Márcia nem precisou ser acionada.

---

### Jornada 3: Dona Márcia, a Administradora — "Preciso de controle sem ficar apagando incêndio"

**Persona:** Márcia, 35 anos, funcionária de uma empresa de transporte que atende 3 rotas universitárias. Fica de plantão durante as noites de aula para suporte operacional. Gerencia ~120 alunos e 3 motoristas.

**🔴 Hoje (Sem PureUrban):**

Márcia recebe ligações dos motoristas quando há problemas — carteirinhas sobrando, alunos que não atendem, ônibus com defeito. Ela tenta ligar para os alunos, manda WhatsApp, e às vezes precisa providenciar transporte auxiliar. Não tem visibilidade de onde os ônibus estão. Recebe reclamações dos alunos sobre atrasos. Tudo é reativo — ela só sabe dos problemas quando explodem.

**🟢 Com PureUrban:**

Márcia abre o painel e vê suas 3 rotas: localização em tempo real de cada ônibus, status de embarque de cada rota. Vê que a Rota 2 tem todos os alunos embarcados — tudo certo. A Rota 1 tem 1 aluno que notificou "não vou voltar" — resolvido automaticamente. A Rota 3 tem um atraso de 10 minutos — ela entra em contato proativamente com o motorista antes que alunos reclamem. Gestão proativa ao invés de reativa.

---

### Jornada 4: Ana, a Aluna — Cenário de Borda — "E se eu esquecer de avisar?"

**Persona:** Ana, 20 anos, mesma turma do Carlos.

Ana saiu da aula e encontrou um amigo que ofereceu carona. Na correria, esqueceu de avisar pelo app. O motorista vê na lista que Ana não fez check-in de retorno. O app envia uma notificação push automática para Ana: "Você embarcou na ida, mas ainda não fez check-in na volta. Vai retornar?" Ana vê a notificação, toca "Não vou voltar". O motorista recebe a atualização instantaneamente. Problema resolvido sem ligações, sem espera.

---

### Resumo de Requisitos Revelados pelas Jornadas

| Jornada | Capacidades Reveladas |
|---|---|
| **Carlos (Aluno - Happy Path)** | Rastreamento GPS em tempo real; Check-in/out via QR code; Notificação "não vou voltar"; Visualização de rota |
| **João (Motorista - Happy Path)** | Lista de alunos por viagem; Status de embarque em tempo real; Recebimento de notificações de ausência; Início/fim de viagem |
| **Márcia (Admin)** | Dashboard de rotas; Visibilidade da frota em tempo real; Status consolidado de embarque por rota; Comunicação com motorista |
| **Ana (Aluno - Edge Case)** | Notificação push de lembrete para check-in pendente; Resposta rápida via notificação |

## Requisitos Específicos do Domínio

### Conformidade & Regulatório

- **LGPD (Lei Geral de Proteção de Dados):** O app coleta dados pessoais (nome, contato) e dados de localização (GPS do motorista). É necessário consentimento explícito no cadastro, política de privacidade clara, e base legal definida para o tratamento de dados.
- **Público-alvo adulto:** O foco são alunos universitários (18+), eliminando a necessidade de compliance com regras específicas de proteção a menores (ECA/COPPA equivalente).

### Restrições Técnicas

- **Funcionalidade offline:** O app deve operar em trechos sem sinal de internet. O check-in via QR code e a lista de alunos do motorista devem funcionar offline, sincronizando quando a conexão retornar.
- **Controle de acesso por empresa:** Apenas alunos cadastrados pela empresa de transporte, com permissão ativa de embarque, podem acessar informações de rotas e realizar check-in via QR code. O QR code deve ser vinculado ao aluno autenticado — não transferível.
- **Privacidade de localização:** O GPS do motorista só deve ser compartilhado durante viagens ativas. Fora desse período, a localização não é coletada nem transmitida.

### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Aluno marca "não vou voltar" por engano | Motorista parte sem o aluno | Período de cancelamento (ex: 2 min) + confirmação push antes de consolidar |
| Falha de GPS em áreas rurais | Alunos sem visibilidade de localização | Comportamento degradado: exibir último ponto conhecido + status "sem sinal" |
| Acesso indevido ao QR code | Embarque de pessoa não autorizada | QR code dinâmico vinculado à sessão do aluno autenticado |
| Perda de dados offline | Check-ins não registrados | Persistência local com sincronização automática ao reconectar |

## Requisitos Específicos por Tipo de Projeto

### Visão Geral da Plataforma

O PureUrban é composto por dois artefatos de software:

| Artefato | Tecnologia | Finalidade |
|---|---|---|
| **App Mobile** | Expo (React Native) — Cross-platform (iOS + Android) | Interface para alunos e motoristas |
| **API Backend** | NestJS (Node.js) + Effect TS | Lógica de negócio, persistência e comunicação em tempo real |

**Premissa de implementação:** Demonstrar a tese acadêmica com implementação funcional simples e evolutiva. Sem publicação em loja para esta entrega.

### Requisitos Mobile (Expo/React Native)

- **Cross-platform:** iOS e Android via Expo.
- **Compatibilidade retroativa:** Suporte a dispositivos de baixo custo (Android 8+ / iOS 13+), visto que empresas de transporte frequentemente adquirem dispositivos baratos para motoristas.
- **Modo offline:** Check-in via QR code e lista de alunos devem funcionar sem conectividade, com sincronização automática ao reconectar.
- **Push notifications:** Via Expo Push Notifications — alertas de check-in pendente, notificações de "não vou voltar", atualizações de viagem.
- **Recursos do dispositivo:** GPS (localização do motorista), Câmera (leitura de QR code), Sistema de notificações push.
- **Publicação:** Não será publicada em loja nesta versão (TCC). Distribuição via Expo Go ou build de desenvolvimento.

### Requisitos API Backend (NestJS)

- **Autenticação:** JWT (JSON Web Tokens) — tokens de acesso e refresh tokens para sessões seguras.
- **Formato de API:** REST com JSON — adequado para o monolito modular, sem necessidade de GraphQL nesta fase.
- **Comunicação em tempo real:** SSE (Server-Sent Events) para streaming de localização GPS e atualizações de status de embarque. Ações do usuário (check-in, notificações) via chamadas REST convencionais.
- **Banco de dados:** PostgreSQL (dados persistentes — usuários, empresas, rotas, histórico de viagens) com Prisma como ORM.
- **Cache e tempo real:** Redis para cache de dados frequentes e armazenamento da localização em tempo real dos motoristas (TTL curto, sobrescrita contínua).
- **Arquitetura:** Monolito modular com Arquitetura Hexagonal — functional core (Effect TS) isolado do imperative shell (NestJS). Domínios definidos via DDD.

### Considerações de Implementação

- **Simplicidade evolutiva:** Cada decisão técnica prioriza a demonstração da tese com possibilidade de evolução futura (ex: REST → GraphQL, monolito → microsserviços).
- **SSE + Redis Pub/Sub:** O motorista envia coordenadas GPS via REST → armazena no Redis → Redis Pub/Sub notifica → SSE entrega aos clientes inscritos (alunos visualizando a rota).
- **Prisma como adaptador:** O Prisma atua como o adaptador de persistência na camada hexagonal, implementando as portas (interfaces) definidas no functional core.

## Escopo do Projeto e Desenvolvimento Faseado

### Estratégia de MVP

**Abordagem:** MVP de Resolução de Problema — provar que o PureUrban elimina a espera indevida e substitui a carteirinha física, enquanto demonstra a tese arquitetural.

**Cronograma:**
- **Fase 1 (MVP/Protótipo):** ~2 meses (entrega fim do semestre — maio/2026) — protótipo utilizável
- **Fase 2 (Refinamento):** +6 meses (entrega final TCC — dezembro/2026) — documentação completa + polish

**Recurso humano:** Desenvolvedor solo (Lucas)

### Fase 1 — MVP (Protótipo Utilizável)

**Jornadas Suportadas:** Carlos (aluno) e João (motorista). Dona Márcia (admin) fica fora do MVP.

**Funcionalidades Must-Have:**

| Funcionalidade | Justificativa |
|---|---|
| Cadastro de empresa, motoristas e alunos | Base do sistema — sem isso, nada funciona |
| CRUD simples de rotas/turmas | Separar grupos de alunos por ônibus |
| Autenticação JWT | Controle de acesso por empresa |
| Check-in/check-out via QR code | Substituição da carteirinha — core do produto |
| Lista de alunos por viagem (motorista) | Visibilidade de quem embarcou/falta |
| Notificação "não vou voltar" | Elimina a espera indevida — maior dor |
| Localização em tempo real (SSE + Redis) | Reduz ansiedade do aluno + visibilidade |
| Arquitetura hexagonal em ≥2 bounded contexts | Demonstração da tese |

**Explicitamente fora do MVP:**
- Dashboard administrativo (Dona Márcia)
- Histórico de viagens e relatórios
- Push notifications complexas (pode usar básico)
- Gestão avançada de rotas
- Publicação em loja

### Fase 2 — Refinamento e Documentação (TCC Final)

- Documentação arquitetural completa (diagramas, justificativas, métricas)
- Testes de domínio demonstrando isolamento funcional core / imperative shell
- Métricas de acoplamento e coesão (Instability, Abstractness)
- Dashboard administrativo básico
- Push notifications completas
- Polish de UX e tratamento de edge cases

### Fase 3 — Visão Futura (Pós-TCC)

- Plataforma enterprise (gestão de veículos, planejamento de rotas)
- Analytics e business intelligence
- Integração com pagamento/mensalidade
- Expansão para outros segmentos de transporte

### Mitigação de Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **SSE + Redis + Frontend real-time** não funcionar como esperado | Média | Alto | Prototipar o fluxo de localização primeiro (spike técnico na semana 1). Fallback: polling a cada 10s |
| **Effect TS + NestJS** integração mais complexa que o esperado | Média | Alto | Iniciar pelo Composition Root + 1 use case simples para validar o padrão antes de expandir |
| **Offline sync** com conflitos de dados | Baixa | Médio | Simplificar: offline apenas para leitura (lista de alunos). Check-in requer conexão mínima |
| **Prazo de 2 meses** insuficiente para MVP completo | Média | Alto | Priorizar: Auth → CRUD rotas → QR check-in → Notificação → Real-time (nessa ordem). Se faltar tempo, real-time vira polling |

## Requisitos Funcionais

### Gestão de Identidade e Acesso

- **FR1:** Empresa pode cadastrar sua organização na plataforma
- **FR2:** Empresa pode cadastrar e gerenciar motoristas vinculados à sua organização
- **FR3:** Empresa pode cadastrar e gerenciar alunos, definindo permissão de embarque por rota
- **FR4:** Motorista pode autenticar-se no app com credenciais vinculadas à empresa
- **FR5:** Aluno pode autenticar-se no app com credenciais vinculadas à empresa
- **FR6:** Sistema valida que apenas alunos com permissão ativa podem acessar informações de rotas e realizar check-in

### Gestão de Rotas e Turmas

- **FR7:** Empresa pode criar, editar e remover rotas de transporte
- **FR8:** Empresa pode vincular alunos a rotas específicas
- **FR9:** Empresa pode vincular motoristas a rotas específicas
- **FR10:** Motorista pode visualizar as rotas atribuídas a ele

### Gestão de Viagens

- **FR11:** Motorista pode iniciar uma viagem (ida) para uma rota atribuída
- **FR12:** Motorista pode encerrar uma viagem em andamento
- **FR13:** Motorista pode iniciar uma viagem de retorno para a mesma rota
- **FR14:** Sistema registra horários de início e fim de cada viagem

### Embarque Digital (QR Code)

- **FR15:** Sistema gera QR code único vinculado à sessão do aluno autenticado (estático por sessão para o MVP)
- **FR16:** Motorista pode escanear QR code do aluno para registrar embarque
- **FR17:** Aluno pode apresentar seu QR code para embarque
- **FR18:** Sistema valida que o aluno tem permissão para embarcar naquela rota
- **FR19:** Sistema registra check-in com timestamp e identificação do aluno
- **FR20:** Sistema rejeita QR codes inválidos, expirados ou de alunos sem permissão
- **FR21:** Check-in via QR code funciona em modo offline, sincronizando quando a conexão retornar

### Lista de Alunos e Status de Embarque

- **FR22:** Motorista pode visualizar lista completa de alunos da viagem atual
- **FR23:** Motorista pode ver o status de cada aluno em tempo real (embarcou, não embarcou, não vai voltar)
- **FR24:** Lista de alunos é acessível em modo offline
- **FR25:** Sistema exibe contagem resumida (ex: "28/32 embarcados")

### Notificação de Ausência

- **FR26:** Aluno pode notificar que não retornará na viagem de volta com uma ação simples
- **FR27:** Motorista recebe notificação imediata quando aluno informa que não retornará
- **FR28:** Motorista pode ver quais alunos notificaram ausência na lista de embarque
- **FR29:** Sistema permite que aluno cancele a notificação de ausência dentro de um período de segurança
- **FR30:** Sistema envia lembrete automático ao aluno que embarcou na ida mas não fez check-in na volta após um período definido

### Localização em Tempo Real

- **FR31:** App do motorista transmite localização GPS durante viagens ativas
- **FR32:** Aluno pode visualizar localização do ônibus em tempo real no mapa
- **FR33:** Sistema interrompe transmissão de GPS quando a viagem é encerrada
- **FR34:** Sistema exibe último ponto conhecido quando há perda de sinal GPS
- **FR35:** Localização é atualizada via SSE com armazenamento em Redis

### Comunicação

- **FR36:** Motorista pode enviar aviso geral para todos os alunos da rota (ex: atraso, mudança)
- **FR37:** Aluno recebe avisos enviados pelo motorista da sua rota

## Requisitos Não-Funcionais

### Performance

- **NFR1:** Check-in via QR code deve ser processado em menos de 2 segundos em cenário online
- **NFR2:** Atualização de localização GPS entregue aos alunos com latência máxima de 5 segundos
- **NFR3:** Notificação de "não vou voltar" entregue ao motorista em menos de 3 segundos
- **NFR4:** Lista de alunos deve carregar em menos de 1 segundo, mesmo com 50+ alunos por rota
- **NFR5:** App deve iniciar e estar operacional em menos de 3 segundos em dispositivos Android 8+

### Segurança (Simplificada para Protótipo)

- **NFR6:** Comunicações entre app e API via HTTPS (TLS 1.2+)
- **NFR7:** Autenticação JWT com access token (15min) e refresh token (7 dias)
- **NFR8:** QR code estático por sessão de login do aluno — segurança suficiente para protótipo. QR dinâmico com validade temporal previsto para Fase 2
- **NFR9:** Dados de usuários utilizados apenas para fins de demonstração acadêmica. Conformidade completa com LGPD (consentimento, direito de exclusão) prevista para Fase 2
- **NFR10:** GPS do motorista coletado e transmitido apenas durante viagens ativas

### Confiabilidade

- **NFR11:** Dados de check-in offline devem persistir localmente sem perda, mesmo com crash do app
- **NFR12:** Sincronização offline→online com resolução automática de conflitos (last-write-wins)
- **NFR13:** Interface exibe estado degradado claro quando offline ("Modo Offline — dados serão sincronizados")
- **NFR14:** Falha na API não impede funcionalidades offline (check-in, visualização de lista)

### Escalabilidade (Preparação Arquitetural)

- **NFR15:** Arquitetura modular (DDD) permite adição de novos bounded contexts sem refatoração do core
- **NFR16:** Separação functional core / imperative shell permite troca de adaptadores sem alterar lógica de negócio
- **NFR17:** Sistema suporta múltiplas empresas com isolamento de dados (multi-tenancy por empresa)

### Acessibilidade e Usabilidade

- **NFR18:** Interface do motorista otimizada para operação com uma mão e em movimento (botões grandes, contraste alto)
- **NFR19:** Fluxos críticos (check-in, "não vou voltar") exigem no máximo 2 toques
- **NFR20:** App utilizável em dispositivos com tela de 5" e resolução mínima de 720p
