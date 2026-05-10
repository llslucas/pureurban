# DOCUMENTO DE REQUISITOS DO PRODUTO

**PureUrban — Plataforma de Gestão de Transporte Universitário Intermunicipal**

---

| Campo | Informação |
|---|---|
| **Identificação** | PU-PRD-001 |
| **Projeto** | PureUrban |
| **Tipo de Documento** | Documento de Requisitos do Produto (Product Requirements Document — PRD) |
| **Versão** | 1.1 |
| **Status** | Vigente |
| **Classificação** | Restrito — Uso Acadêmico e Interno |
| **Data de Criação** | 14 de março de 2026 |
| **Última Revisão** | 10 de maio de 2026 |
| **Autor** | Lucas |
| **Contexto Acadêmico** | Trabalho de Conclusão de Curso — Bacharelado em Engenharia de Software |

---

## Histórico de Revisões

| Versão | Data | Autor | Descrição das Alterações |
|---|---|---|---|
| 1.0 | 14/03/2026 | Lucas | Criação do documento a partir de sessão estruturada de discovery |
| 1.1 | 10/05/2026 | Lucas | Revisão de formato e adequação para entrega formal |

---

## Sumário

1. [Sumário Executivo](#1-sumário-executivo)
2. [Classificação do Projeto](#2-classificação-do-projeto)
3. [Critérios de Sucesso](#3-critérios-de-sucesso)
4. [Personas e Jornadas do Usuário](#4-personas-e-jornadas-do-usuário)
5. [Requisitos Específicos do Domínio](#5-requisitos-específicos-do-domínio)
6. [Especificações da Plataforma](#6-especificações-da-plataforma)
7. [Escopo e Desenvolvimento Faseado](#7-escopo-e-desenvolvimento-faseado)
8. [Requisitos Funcionais](#8-requisitos-funcionais)
9. [Requisitos Não-Funcionais](#9-requisitos-não-funcionais)
10. [Glossário](#10-glossário)
11. [Referências](#11-referências)

---

## 1. Sumário Executivo

O PureUrban é uma plataforma mobile (Expo/React Native) com API backend (NestJS) que digitaliza a gestão de embarque e a comunicação entre motoristas e alunos universitários no transporte intermunicipal fornecido por prefeituras e empresas de transporte. O sistema substitui o processo manual de carteirinhas físicas e grupos de WhatsApp por um fluxo digital de check-in/check-out, notificações estruturadas e visibilidade operacional da frota em tempo real.

O produto atende uma lacuna específica do mercado brasileiro: alunos adultos de cidades do interior que dependem de transporte de terceiros para acessar faculdades em outras cidades. Diferentemente das soluções existentes de transporte escolar — focadas na relação escola-pais para crianças do ensino básico — o PureUrban opera na dinâmica **aluno adulto ↔ motorista ↔ empresa de transporte**, onde a comunicação direta e a autonomia do aluno são centrais.

O modelo de negócio adotado é **B2B2C**: empresas de transporte e prefeituras são os clientes pagantes, beneficiando-se da eficiência operacional e da redução de reclamações; alunos e motoristas são os usuários finais, beneficiando-se da praticidade e da comunicação direta.

O projeto serve simultaneamente como **Trabalho de Conclusão de Curso (TCC) em Engenharia de Software**, onde o foco acadêmico é a documentação rigorosa da arquitetura do backend. A implementação utiliza **Arquitetura Hexagonal** (COCKBURN, 2005), **Domain-Driven Design** (EVANS, 2003) em monolito modular, e separação entre **functional core** (Effect TS) e **imperative shell** (NestJS), fundamentado no padrão **Functional Core, Imperative Shell** (BERNHARDT, 2012).

### 1.1 Diferenciais do Produto

- **Problema validado em primeira mão:** O autor é um aluno que vivencia o problema diariamente — motoristas aguardando alunos que já partiram, carteirinhas esquecidas, comunicação caótica via WhatsApp.
- **Nicho negligenciado:** O transporte universitário intermunicipal em cidades do interior carece de solução tecnológica dedicada. As soluções existentes focam em transporte escolar infantil urbano.
- **Arquitetura como diferencial acadêmico:** O backend demonstra a integração entre programação funcional pura (Effect TS) e framework orientado a objetos (NestJS) sem acoplamento, com domínios isolados via DDD — um caso de estudo concreto para o TCC.
- **Modelo B2B2C com incentivos alinhados:** O cliente paga pela eficiência operacional; o usuário final obtém praticidade. Nenhum conflito de interesse entre as partes.

---

## 2. Classificação do Projeto

| Dimensão | Valor |
|---|---|
| **Tipo** | Aplicativo Mobile (Expo/React Native) + API Backend (NestJS) |
| **Domínio** | Transporte Educacional (EdTech / Logística Urbana) |
| **Complexidade** | Média |
| **Contexto de Desenvolvimento** | Greenfield |
| **Modelo de Negócio** | B2B2C |
| **Natureza** | Produto comercial e Trabalho de Conclusão de Curso |

---

## 3. Critérios de Sucesso

### 3.1 Sucesso do Usuário Final

**Aluno:**
- Embarque digital via QR code em menos de 5 segundos, eliminando a dependência de carteirinhas físicas.
- Visualização da localização do ônibus em tempo real, reduzindo a incerteza sobre horários de chegada.
- Envio de notificação de ausência com um único toque, eliminando a necessidade de ligações ou mensagens avulsas no WhatsApp.

**Motorista:**
- Lista digital de alunos por viagem com status de embarque atualizado automaticamente, sem necessidade de contagem manual de carteirinhas.
- Recebimento imediato de notificações quando um aluno comunica que não retornará, permitindo a partida sem espera indevida.
- Eliminação de atrasos de 30 a 60 minutos causados por alunos que partem sem comunicar e não atendem ligações.

### 3.2 Sucesso do Negócio

**Empresa de Transporte / Prefeitura:**
- Eliminação da espera indevida por alunos que não retornam, com meta de redução superior a 90% nos atrasos originados por esse motivo.
- Redução significativa de reclamações de alunos relacionadas à comunicação e ao tempo de espera.
- Visibilidade em tempo real da localização da frota, possibilitando intervenção e suporte proativos ao motorista.
- Digitalização completa do controle de embarque, substituindo integralmente o processo manual de carteirinhas.

### 3.3 Sucesso Técnico — Objetivos Acadêmicos (TCC)

- **Isolamento de domínio:** Módulos do functional core (Effect TS) testáveis de forma isolada, sem dependência do NestJS ou de qualquer infraestrutura externa.
- **Qualidade de código mensurável:** Métricas de coesão e acoplamento demonstrando a eficácia da arquitetura hexagonal, referenciadas em indicadores como *Instability* e *Abstractness* (MARTIN, 2003).
- **Velocidade de testes:** Evidência de que a separação functional core / imperative shell permite a execução de suítes de testes unitários de domínio em menos de 100ms, sem necessidade de setup de infraestrutura.
- **Prova de conceito funcional:** MVP operacional demonstrando o fluxo completo de embarque digital, notificação de ausência e rastreamento em tempo real.
- **Aderência arquitetural documentada:** Demonstração prática e referenciada dos padrões Arquitetura Hexagonal (COCKBURN, 2005), DDD (EVANS, 2003) e Functional Core/Imperative Shell (BERNHARDT, 2012).

### 3.4 Resultados Mensuráveis

| Métrica | Situação Atual (Sem PureUrban) | Meta com PureUrban |
|---|---|---|
| Tempo de espera por aluno ausente | 30 a 60 minutos | Inferior a 2 minutos (notificação imediata) |
| Processo de embarque | Manual (carteirinha física) | Digital via QR code (menos de 5 segundos) |
| Comunicação motorista–aluno | WhatsApp (não estruturado, sem garantia de entrega) | In-app (estruturada e rastreável) |
| Visibilidade da frota | Inexistente | Tempo real via GPS |
| Testes de domínio (contexto TCC) | Não aplicável | Executáveis sem infraestrutura |

---

## 4. Personas e Jornadas do Usuário

Esta seção apresenta as principais personas do sistema e suas respectivas jornadas, evidenciando as dores atuais e os ganhos proporcionados pelo PureUrban. As jornadas também fundamentam os requisitos funcionais descritos na Seção 8.

### 4.1 Persona: Carlos — O Aluno (Jornada Principal)

**Perfil:** Carlos, 22 anos, estudante de Administração. Residente em cidade do interior, depende do ônibus municipal para acessar a faculdade em cidade vizinha. Frequenta aulas no período noturno, saindo de casa por volta das 17h.

**Situação Atual (sem PureUrban):**

Carlos sai de casa e caminha até o ponto de ônibus sem saber se o veículo já passou ou está atrasado. Consulta o grupo de WhatsApp, mas não obtém resposta. O ônibus chega com atraso; Carlos entrega sua carteirinha ao motorista e ocupa um assento. O veículo percorre os demais pontos até deixar a cidade. Ao término das aulas, Carlos retorna ao ponto de embarque para o retorno.

Nessa volta, uma colega decide partir com um amigo de carro, esquecendo sua carteirinha no ônibus. O motorista aguarda. Liga para a colega — sem resposta. Solicita que outros alunos tentem contato — sem sucesso. Quarenta minutos depois, após acionar a administradora, descobre-se que a colega já havia partido. Carlos chega em casa quase meia-noite, visivelmente insatisfeito.

**Com PureUrban:**

Carlos abre o aplicativo antes de sair e visualiza que o ônibus está a três pontos de distância, com chegada estimada em oito minutos. Ao embarcar, aproxima o celular do QR code e conclui o check-in em três segundos — sem carteirinha física.

Na volta, faz o check-in de retorno pelo mesmo processo. A colega que partiu com o amigo enviou, pelo próprio aplicativo, uma notificação de ausência. O motorista recebeu o aviso instantaneamente e atualizou a lista automaticamente. O ônibus parte no horário. Carlos chega em casa no horário previsto.

**Requisitos revelados:** Rastreamento GPS em tempo real; check-in/check-out via QR code; notificação de ausência; visualização de rota.

---

### 4.2 Persona: João — O Motorista (Jornada Principal)

**Perfil:** João, 48 anos, motorista com 15 anos de experiência. Responsável por uma turma de 38 alunos universitários na rota interior–cidade universitária. Conhece muitos alunos pelo nome, mas a rotatividade semestral dificulta o controle.

**Situação Atual (sem PureUrban):**

João coleta as carteirinhas nos pontos ao longo da rota, empilhando-as no painel do veículo. Na faculdade, possui uma pilha de aproximadamente 30 carteirinhas. No retorno, os alunos as recuperam. Quando a pilha se esvazia, João pode partir. Verificações visuais nos assentos complementam o processo.

Nessa viagem, sobram duas carteirinhas. João liga para o primeiro aluno — atendido, em cinco minutos chega. O segundo não atende. Após acionamento da administradora e 45 minutos de espera, descobre-se que o aluno já havia partido. João deixa a faculdade frustrado, preocupado com a decisão tomada, enquanto os demais 28 alunos manifestam insatisfação com o atraso.

**Com PureUrban:**

João inicia a viagem pelo aplicativo. Em cada ponto, os alunos fazem check-in via QR code e a lista é atualizada automaticamente. A tela exibe: "28/32 embarcados". Nenhuma carteirinha para controlar.

No retorno, a lista indica: "30/32 confirmados". Uma aluna notificou ausência 20 minutos antes pelo aplicativo; o outro aluno acaba de enviar a notificação enquanto João verifica a lista. Status completo, sem pendências. João parte no horário, sem acionamento da administradora.

**Requisitos revelados:** Lista digital de alunos por viagem; status de embarque em tempo real; recebimento de notificações de ausência; início e encerramento de viagem.

---

### 4.3 Persona: Márcia — A Administradora

**Perfil:** Márcia, 35 anos, funcionária de empresa de transporte responsável por três rotas universitárias. Trabalha em regime de plantão durante as noites de aula, gerenciando aproximadamente 120 alunos e três motoristas.

**Situação Atual (sem PureUrban):**

Márcia recebe ligações dos motoristas diante de qualquer intercorrência. Sem visibilidade da localização dos veículos, atua de forma inteiramente reativa — só toma conhecimento dos problemas quando estes já estão em curso. Reclamações de alunos sobre atrasos chegam por telefone e WhatsApp.

**Com PureUrban:**

Márcia acessa o painel e visualiza as três rotas simultaneamente: localização em tempo real de cada ônibus e status de embarque consolidado por rota. Identifica proativamente que a Rota 3 acumula um atraso de dez minutos e entra em contato com o motorista antes que os alunos registrem reclamações. A gestão passa de reativa para proativa.

**Requisitos revelados:** Painel administrativo de rotas; visibilidade da frota em tempo real; status consolidado de embarque por rota; canal de comunicação com motoristas.

> **Observação de Escopo:** O painel administrativo (Persona Márcia) está fora do escopo do MVP (Fase 1). Sua implementação está prevista para a Fase 2.

---

### 4.4 Persona: Ana — A Aluna (Cenário de Borda)

**Perfil:** Ana, 20 anos, integrante da mesma turma de Carlos.

**Cenário:** Ana aceita carona de um amigo após as aulas e, na correria, esquece de notificar sua ausência pelo aplicativo. O sistema detecta que Ana realizou check-in na ida, mas não registrou retorno. Uma notificação push automática é enviada: *"Você embarcou na ida, mas ainda não confirmou o retorno. Vai retornar?"* Ana toca "Não vou voltar". O motorista recebe a atualização instantaneamente. Nenhuma ligação, nenhuma espera.

**Requisitos revelados:** Notificação push automática para check-in de retorno pendente; resposta rápida via notificação.

---

### 4.5 Síntese dos Requisitos por Jornada

| Jornada | Capacidades Reveladas |
|---|---|
| Carlos — Aluno (Fluxo Principal) | Rastreamento GPS em tempo real; check-in/out via QR code; notificação de ausência; visualização de rota |
| João — Motorista (Fluxo Principal) | Lista de alunos por viagem; status de embarque em tempo real; recebimento de notificações de ausência; início/fim de viagem |
| Márcia — Administradora | Painel de rotas; visibilidade da frota em tempo real; status consolidado de embarque; comunicação com motoristas |
| Ana — Aluna (Cenário de Borda) | Notificação push de lembrete para check-in pendente; resposta rápida via notificação |

---

## 5. Requisitos Específicos do Domínio

### 5.1 Conformidade Legal e Regulatória

- **LGPD (Lei Geral de Proteção de Dados — Lei nº 13.709/2018):** O sistema coleta dados pessoais (nome, contato) e dados de localização (GPS do motorista durante viagens ativas). São obrigatórios: consentimento explícito no cadastro, política de privacidade acessível e base legal definida para o tratamento de dados. Conformidade completa com a LGPD está prevista para a Fase 2.
- **Público-alvo adulto:** O foco são alunos universitários maiores de 18 anos, dispensando requisitos específicos de proteção a menores (equivalentes ao ECA e ao COPPA).

### 5.2 Restrições Técnicas

- **Funcionamento offline:** O aplicativo deve operar em trechos sem conectividade. O check-in via QR code e a lista de alunos do motorista devem funcionar offline, sincronizando automaticamente ao restabelecer a conexão.
- **Controle de acesso por empresa:** Apenas alunos cadastrados pela empresa de transporte, com permissão de embarque ativa, podem acessar informações de rotas e realizar check-in. O QR code é vinculado ao aluno autenticado e não é transferível.
- **Privacidade de localização:** O GPS do motorista é coletado e transmitido exclusivamente durante viagens ativas. Fora desse período, nenhuma localização é registrada ou transmitida.

### 5.3 Análise de Riscos

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| Aluno notifica ausência por engano | Partida sem o aluno | Média | Janela de cancelamento (2 min) + confirmação push antes de consolidar o status |
| Falha de GPS em áreas rurais | Alunos sem visibilidade de localização | Média | Comportamento degradado: exibir último ponto conhecido com indicador "sem sinal" |
| Acesso indevido ao QR code | Embarque de pessoa não autorizada | Baixa | QR code estático por sessão no MVP; QR dinâmico com validade temporal previsto para Fase 2 |
| Perda de dados offline | Check-ins não registrados | Baixa | Persistência local via SQLite com sincronização automática ao reconectar |

---

## 6. Especificações da Plataforma

### 6.1 Visão Geral dos Artefatos

O PureUrban é composto por dois artefatos de software interdependentes:

| Artefato | Tecnologia | Finalidade |
|---|---|---|
| **Aplicativo Mobile** | Expo SDK (React Native) — Multiplataforma iOS e Android | Interface para alunos e motoristas |
| **API Backend** | NestJS (Node.js) + Effect TS | Lógica de negócio, persistência e comunicação em tempo real |

**Premissa de implementação:** Demonstrar a tese acadêmica com uma implementação funcional, simples e evolutiva. A publicação em lojas de aplicativos não está prevista para esta entrega.

### 6.2 Requisitos do Aplicativo Mobile (Expo/React Native)

- **Multiplataforma:** Suporte a iOS e Android via Expo SDK.
- **Compatibilidade com dispositivos de baixo custo:** Android 8+ e iOS 13+, considerando que empresas de transporte frequentemente disponibilizam dispositivos de menor valor para motoristas.
- **Modo offline:** Check-in via QR code e lista de alunos funcionam sem conectividade, com sincronização automática ao reconectar.
- **Notificações push:** Implementadas via Expo Push Notifications — alertas de check-in pendente, notificações de ausência e atualizações de viagem.
- **Recursos de hardware utilizados:** GPS (localização do motorista), câmera (leitura de QR code), sistema de notificações push do dispositivo.
- **Distribuição:** Via Expo Go ou build de desenvolvimento (sem publicação em loja nesta versão).

### 6.3 Requisitos da API Backend (NestJS)

- **Autenticação:** JWT (JSON Web Tokens) com tokens de acesso (15 min) e refresh tokens (7 dias).
- **Formato de API:** REST com JSON, adequado ao monolito modular.
- **Comunicação em tempo real:** Server-Sent Events (SSE) para streaming de localização GPS e atualizações de status de embarque. Ações do usuário (check-in, notificações de ausência) via chamadas REST convencionais.
- **Banco de dados:** PostgreSQL (dados persistentes — usuários, empresas, rotas, histórico de viagens) com Prisma como ORM.
- **Cache e dados em tempo real:** Redis para armazenamento de localização do motorista em tempo real (TTL curto, sobrescrita contínua) e blacklist de tokens JWT invalidados.
- **Arquitetura:** Monolito modular com Arquitetura Hexagonal — functional core (Effect TS) isolado do imperative shell (NestJS), com domínios definidos segundo DDD.

### 6.4 Padrão de Comunicação em Tempo Real

```
Motorista (App Mobile)
  └─ REST → API NestJS → Redis (armazena localização)
               └─ Redis Pub/Sub → SSE Controller → Aluno (App Mobile)
```

O motorista transmite coordenadas GPS via REST. A API armazena no Redis, que notifica via Pub/Sub o controller SSE, que entrega a atualização em tempo real aos alunos inscritos na rota.

---

## 7. Escopo e Desenvolvimento Faseado

### 7.1 Estratégia de MVP

**Abordagem:** MVP de Resolução de Problema — demonstrar que o PureUrban elimina a espera indevida e substitui a carteirinha física, enquanto valida a tese arquitetural.

**Cronograma previsto:**
- **Fase 1 (MVP/Protótipo):** Entrega em dezembro de 2026 — protótipo funcional com documentação completa.
- **Fase 2 (Refinamento):** Pós-TCC — polish de UX, funcionalidades avançadas e expansão comercial.

**Equipe:** 2 desenvolvedores (Lucas + 1 colaborador).

### 7.2 Fase 1 — MVP (Protótipo Funcional)

**Jornadas suportadas:** Carlos (aluno) e João (motorista). O painel da administradora Márcia está fora do escopo desta fase.

**Funcionalidades obrigatórias (Must-Have):**

| Funcionalidade | Justificativa |
|---|---|
| Cadastro de empresa, motoristas e alunos | Fundação do sistema — pré-requisito para todas as demais funcionalidades |
| CRUD de rotas e turmas | Separação dos grupos de alunos por ônibus e rota |
| Autenticação JWT com RBAC | Controle de acesso por empresa e papel (role) |
| Check-in/check-out via QR code | Substituição digital da carteirinha física — funcionalidade central |
| Lista de alunos por viagem (visão motorista) | Visibilidade de quem embarcou e quem ainda está pendente |
| Notificação de ausência ("não vou voltar") | Elimina a espera indevida — maior dor identificada nas jornadas |
| Localização em tempo real (SSE + Redis) | Reduz ansiedade do aluno e oferece visibilidade operacional |
| Arquitetura hexagonal em dois ou mais bounded contexts | Demonstração central da tese acadêmica |

**Funcionalidades explicitamente fora do MVP:**

- Painel administrativo (Persona Márcia)
- Histórico de viagens e relatórios gerenciais
- Push notifications avançadas (implementação básica pode ser incluída)
- Gestão avançada de rotas e planejamento de horários
- Publicação nas lojas App Store e Google Play
- Conformidade completa com LGPD

### 7.3 Fase 2 — Refinamento Pós-MVP

- Documentação arquitetural completa (diagramas, justificativas, métricas de acoplamento)
- Testes de domínio demonstrando isolamento functional core / imperative shell
- Métricas de acoplamento e coesão (Instability, Abstractness — MARTIN, 2003)
- Painel administrativo básico (Persona Márcia)
- Push notifications completas
- Refinamento de UX e tratamento abrangente de edge cases
- Conformidade com LGPD

### 7.4 Fase 3 — Visão Futura (Pós-TCC)

- Plataforma enterprise: gestão de veículos, planejamento avançado de rotas
- Analytics e business intelligence para empresas de transporte
- Integração com sistemas de pagamento e mensalidade
- Expansão para outros segmentos de transporte (transporte de trabalhadores, fretado corporativo)

### 7.5 Mitigação de Riscos de Projeto

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| SSE + Redis + frontend em tempo real não funcionar conforme esperado | Média | Alto | Prototipar o fluxo de localização na primeira semana (spike técnico). Fallback: polling a cada 10 segundos |
| Integração Effect TS + NestJS mais complexa que o previsto | Média | Alto | Iniciar pelo Composition Root com um único use case simples para validar o padrão antes de escalar |
| Sincronização offline com conflitos de dados | Baixa | Médio | Simplificação: offline restrito à leitura da lista de alunos. Check-in requer conectividade mínima |
| Prazo insuficiente para o MVP completo | Média | Alto | Priorização rígida: Auth → CRUD de rotas → QR check-in → Notificação → Tempo real. Real-time pode ser degradado para polling se necessário |

---

## 8. Requisitos Funcionais

### 8.1 Gestão de Identidade e Acesso

| ID | Descrição |
|---|---|
| FR1 | A empresa pode cadastrar sua organização na plataforma |
| FR2 | A empresa pode cadastrar e gerenciar motoristas vinculados à sua organização |
| FR3 | A empresa pode cadastrar e gerenciar alunos, definindo permissão de embarque por rota |
| FR4 | O motorista pode autenticar-se no aplicativo com credenciais vinculadas à sua empresa |
| FR5 | O aluno pode autenticar-se no aplicativo com credenciais vinculadas à sua empresa |
| FR6 | O sistema valida que apenas alunos com permissão ativa podem acessar informações de rotas e realizar check-in |

### 8.2 Gestão de Rotas e Turmas

| ID | Descrição |
|---|---|
| FR7 | A empresa pode criar, editar e remover rotas de transporte |
| FR8 | A empresa pode vincular alunos a rotas específicas |
| FR9 | A empresa pode vincular motoristas a rotas específicas |
| FR10 | O motorista pode visualizar as rotas atribuídas a ele |

### 8.3 Gestão de Viagens

| ID | Descrição |
|---|---|
| FR11 | O motorista pode iniciar uma viagem de ida para uma rota atribuída |
| FR12 | O motorista pode encerrar uma viagem em andamento |
| FR13 | O motorista pode iniciar uma viagem de retorno para a mesma rota |
| FR14 | O sistema registra os horários de início e término de cada viagem |

### 8.4 Embarque Digital via QR Code

| ID | Descrição |
|---|---|
| FR15 | O sistema gera QR code único vinculado à sessão do aluno autenticado (estático por sessão no MVP) |
| FR16 | O motorista pode escanear o QR code do aluno para registrar o embarque |
| FR17 | O aluno pode apresentar seu QR code para embarque |
| FR18 | O sistema valida que o aluno possui permissão de embarque naquela rota |
| FR19 | O sistema registra o check-in com timestamp e identificação do aluno |
| FR20 | O sistema rejeita QR codes inválidos, expirados ou de alunos sem permissão |
| FR21 | O check-in via QR code funciona em modo offline, sincronizando ao restabelecer a conexão |

### 8.5 Lista de Alunos e Status de Embarque

| ID | Descrição |
|---|---|
| FR22 | O motorista pode visualizar a lista completa de alunos da viagem atual |
| FR23 | O motorista pode verificar o status de cada aluno em tempo real (embarcou / não embarcou / não vai retornar) |
| FR24 | A lista de alunos é acessível em modo offline |
| FR25 | O sistema exibe contagem resumida (ex: "28/32 embarcados") |

### 8.6 Notificação de Ausência

| ID | Descrição |
|---|---|
| FR26 | O aluno pode notificar que não retornará na viagem de volta com uma ação única |
| FR27 | O motorista recebe notificação imediata quando um aluno informa que não retornará |
| FR28 | O motorista pode identificar, na lista de embarque, quais alunos notificaram ausência |
| FR29 | O sistema permite que o aluno cancele a notificação de ausência dentro de uma janela de segurança definida |
| FR30 | O sistema envia lembrete automático ao aluno que embarcou na ida mas não registrou retorno após período definido |

### 8.7 Localização em Tempo Real

| ID | Descrição |
|---|---|
| FR31 | O aplicativo do motorista transmite localização GPS durante viagens ativas |
| FR32 | O aluno pode visualizar a localização do ônibus em tempo real no mapa |
| FR33 | O sistema interrompe a transmissão de GPS quando a viagem é encerrada |
| FR34 | O sistema exibe o último ponto de localização conhecido quando há perda de sinal GPS |
| FR35 | A localização é atualizada via SSE com armazenamento intermediário em Redis |

### 8.8 Comunicação

| ID | Descrição |
|---|---|
| FR36 | O motorista pode enviar avisos gerais para todos os alunos da rota (ex: atraso, mudança de ponto) |
| FR37 | O aluno recebe os avisos enviados pelo motorista responsável pela sua rota |

---

## 9. Requisitos Não-Funcionais

### 9.1 Desempenho

| ID | Descrição |
|---|---|
| NFR1 | Check-in via QR code processado em menos de 2 segundos em condição online |
| NFR2 | Atualização de localização GPS entregue aos alunos com latência máxima de 5 segundos |
| NFR3 | Notificação de ausência entregue ao motorista em menos de 3 segundos |
| NFR4 | Lista de alunos carregada em menos de 1 segundo, mesmo com mais de 50 alunos por rota |
| NFR5 | Aplicativo inicializado e operacional em menos de 3 segundos em dispositivos Android 8+ |

### 9.2 Segurança

| ID | Descrição |
|---|---|
| NFR6 | Toda comunicação entre o aplicativo e a API realizada via HTTPS (TLS 1.2 ou superior) |
| NFR7 | Autenticação JWT com access token (15 min) e refresh token (7 dias) |
| NFR8 | QR code estático por sessão de login do aluno — segurança adequada para o protótipo. QR dinâmico com validade temporal previsto para a Fase 2 |
| NFR9 | Dados de usuários utilizados exclusivamente para fins de demonstração acadêmica. Conformidade plena com LGPD prevista para a Fase 2 |
| NFR10 | GPS do motorista coletado e transmitido somente durante viagens ativas |

### 9.3 Confiabilidade

| ID | Descrição |
|---|---|
| NFR11 | Dados de check-in offline persistidos localmente sem perda, mesmo em caso de encerramento inesperado do aplicativo |
| NFR12 | Sincronização offline→online com resolução automática de conflitos (last-write-wins) |
| NFR13 | Interface exibe estado degradado claro quando offline ("Modo Offline — dados serão sincronizados") |
| NFR14 | Falha na API não impede o uso das funcionalidades offline (check-in local, visualização de lista) |

### 9.4 Escalabilidade (Preparação Arquitetural)

| ID | Descrição |
|---|---|
| NFR15 | Arquitetura modular (DDD com bounded contexts) permite adição de novos domínios sem refatoração do núcleo existente |
| NFR16 | Separação functional core / imperative shell permite substituição de adaptadores sem alteração da lógica de negócio |
| NFR17 | O sistema suporta múltiplas empresas com isolamento completo de dados (multi-tenancy por empresa) |

### 9.5 Acessibilidade e Usabilidade

| ID | Descrição |
|---|---|
| NFR18 | Interface do motorista otimizada para operação com uma mão e em movimento (botões grandes, alto contraste) |
| NFR19 | Fluxos críticos (check-in, notificação de ausência) exigem no máximo 2 toques para conclusão |
| NFR20 | Aplicativo utilizável em dispositivos com tela de 5 polegadas e resolução mínima de 720p |

---

## 10. Glossário

| Termo | Definição |
|---|---|
| **API** | Application Programming Interface — interface de programação que permite a comunicação entre sistemas |
| **B2B2C** | Business-to-Business-to-Consumer — modelo em que o produto é vendido a uma empresa (B2B) que o oferece ao consumidor final (B2C) |
| **Bounded Context** | Conceito do DDD que define uma fronteira explícita dentro da qual um modelo de domínio específico é válido e consistente |
| **Check-in** | Registro digital de embarque do aluno no ônibus, realizado via leitura de QR code |
| **DDD** | Domain-Driven Design — abordagem de desenvolvimento de software centrada no modelo de domínio do negócio (EVANS, 2003) |
| **Effect TS** | Biblioteca TypeScript para programação funcional tipada com gerenciamento de efeitos colaterais |
| **Expo** | Framework e plataforma para desenvolvimento multiplataforma de aplicativos React Native |
| **Functional Core** | Camada de domínio pura, sem efeitos colaterais, composta por lógica de negócio testável isoladamente (BERNHARDT, 2012) |
| **GPS** | Global Positioning System — sistema de posicionamento global por satélite |
| **Greenfield** | Projeto desenvolvido do zero, sem código legado ou restrições de sistemas existentes |
| **Imperative Shell** | Camada de infraestrutura que orquestra efeitos colaterais (I/O, banco de dados, rede) e conecta o functional core ao mundo externo (BERNHARDT, 2012) |
| **JWT** | JSON Web Token — padrão aberto para transmissão segura de informações entre partes como um objeto JSON assinado |
| **LGPD** | Lei Geral de Proteção de Dados (Lei nº 13.709/2018) — legislação brasileira que regula o tratamento de dados pessoais |
| **MVP** | Minimum Viable Product — versão mínima do produto com funcionalidades suficientes para validar a proposta de valor |
| **NestJS** | Framework Node.js para construção de aplicações server-side escaláveis, baseado em TypeScript |
| **ORM** | Object-Relational Mapping — técnica de mapeamento entre objetos do código e tabelas do banco de dados relacional |
| **Prisma** | ORM moderno para TypeScript e Node.js, utilizado como adaptador de persistência |
| **QR Code** | Quick Response Code — código de barras bidimensional lido por câmera de smartphone |
| **RBAC** | Role-Based Access Control — controle de acesso baseado em papéis de usuário |
| **Redis** | Banco de dados em memória utilizado como cache e sistema de mensageria Pub/Sub |
| **REST** | Representational State Transfer — estilo arquitetural para comunicação entre sistemas via HTTP |
| **SSE** | Server-Sent Events — tecnologia para envio de atualizações em tempo real do servidor para o cliente via HTTP |
| **TCC** | Trabalho de Conclusão de Curso |
| **TLS** | Transport Layer Security — protocolo criptográfico para comunicação segura em rede |

---

## 11. Referências

BERNHARDT, G. **Functional Core, Imperative Shell**. Destroy All Software, 2012. Disponível em: https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell.

COCKBURN, A. **Hexagonal Architecture**. 2005. Disponível em: https://alistair.cockburn.us/hexagonal-architecture/.

EVANS, E. **Domain-Driven Design: Tackling Complexity in the Heart of Software**. Boston: Addison-Wesley, 2003.

MARTIN, R. C. **Agile Software Development, Principles, Patterns, and Practices**. Upper Saddle River: Prentice Hall, 2003.

---

*Documento gerado e mantido no contexto do Trabalho de Conclusão de Curso em Engenharia de Software.*
*Versão 1.1 — 10 de maio de 2026*
