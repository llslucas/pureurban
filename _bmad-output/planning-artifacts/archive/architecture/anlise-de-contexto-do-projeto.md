# Análise de Contexto do Projeto

### Visão Geral dos Requisitos

**Requisitos Funcionais:**

37 requisitos funcionais organizados em 7 categorias:

| Categoria | FRs | Implicação Arquitetural |
|---|---|---|
| Gestão de Identidade e Acesso | FR1-FR6 | Multi-tenancy por empresa, RBAC (3 roles: admin, motorista, aluno), JWT |
| Gestão de Rotas e Turmas | FR7-FR10 | CRUD com vínculo empresa→rota→aluno/motorista |
| Gestão de Viagens | FR11-FR14 | Máquina de estados (viagem: idle→ativa→encerrada), ida/volta como conceito de domínio |
| Embarque Digital (QR Code) | FR15-FR21 | QR estático por sessão, validação multi-regra, offline-first com sync |
| Lista de Alunos e Status | FR22-FR25 | Leitura em tempo real + offline, agregações (contagem embarcados) |
| Notificação de Ausência | FR26-FR30 | Eventos assíncronos motorista↔aluno, período de cancelamento, lembrete automático baseado em tempo |
| Localização em Tempo Real | FR31-FR35 | SSE + Redis Pub/Sub, streaming contínuo durante viagem, graceful degradation |
| Comunicação | FR36-FR37 | Broadcast motorista→alunos da rota |

**Requisitos Não-Funcionais:**

| Área | Requisitos-Chave | Decisão Implícita |
|---|---|---|
| Performance | QR check-in <2s, GPS latência <5s, notificação <3s | Redis como cache, SSE para push, queries otimizadas |
| Offline | Check-in offline, lista offline, persistência local, sync automático | Storage local no device + fila de sincronização + conflict resolution (last-write-wins) |
| Segurança | HTTPS, JWT (access 15min + refresh 7d), QR vinculado à sessão | Auth middleware, token rotation, session management |
| Multi-tenancy | Isolamento de dados por empresa | Tenant-aware queries, row-level filtering |
| Escalabilidade | DDD com bounded contexts, functional core / imperative shell | Hexagonal Architecture com ports & adapters |

**Escala & Complexidade:**

- Domínio primário: Mobile App (Expo/React Native) + API Backend (NestJS)
- Nível de complexidade: Média-Alta
- Componentes arquiteturais estimados: ~8-10 (Auth, Rotas, Viagens, Embarque, Notificações, Real-time/GPS, Sync, Comunicação)

### Restrições Técnicas & Dependências

- **Stack definida no PRD:** Expo/React Native, NestJS, Effect TS, PostgreSQL/Prisma, Redis, SSE
- **Arquitetura acadêmica (TCC):** Hexagonal Architecture + DDD + Functional Core / Imperative Shell — parte da tese, não opcional
- **Recurso:** Desenvolvedor solo (Lucas)
- **Prazo:** MVP ~2 meses (maio/2026), documentação completa dezembro/2026
- **Distribuição:** Expo Go / build de dev (sem loja)
- **Dispositivos:** Android 8+ / iOS 13+, telas de 5", dispositivos de baixo custo

### Preocupações Transversais Identificadas

- **Multi-tenancy** — permeia todo o sistema, desde autenticação até queries de dados
- **Offline/Online sync** — afeta check-in, lista de alunos, e potencialmente notificações
- **Autenticação e autorização** — JWT + RBAC por empresa, validação em cada operação
- **Real-time event delivery** — SSE para localização + notificações de status de embarque
- **Auditoria e rastreabilidade** — timestamps de check-in, histórico de viagens
- **LGPD** — consentimento, privacidade de GPS, direito de exclusão (Fase 2, mas com impacto arquitetural desde já)

### Desafios Arquiteturais Únicos

1. **Effect TS + NestJS coexistência** — Integrar programação funcional pura com framework OO sem acoplamento. Composition Root como ponto de encontro.
2. **SSE + Redis Pub/Sub para real-time** — Fluxo: REST → Redis → Pub/Sub → SSE → cliente. Fallback para polling caso falhe.
3. **Offline-first com sync** — Persistência local + queue de operações + resolução de conflitos em devices baratos.
4. **Bounded contexts com Effect TS** — Definir limites dos domínios mantendo o functional core testável isoladamente.
