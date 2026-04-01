# Trade-off Analysis: Separação de Schemas PostgreSQL por Bounded Context

**Data:** 2026-03-30
**Decisão:** Adotar separação por schemas
**Motivação:** Aprendizado acadêmico (TCC) + preparação para arquitetura distribuída futura

---

## Contexto

A arquitetura original define um schema Prisma único (`public`) com separação lógica por comentários. A proposta é migrar para schemas PostgreSQL por bounded context antes da criação do schema Prisma, aproveitando o suporte `@@schema()` do Prisma v7.

### Mapeamento Proposto

| Bounded Context | PostgreSQL Schema | Entidades principais |
|---|---|---|
| `auth` | `auth` | User, RefreshToken |
| `routing` | `routing` | Route, StudentRoute, DriverRoute |
| `boarding` | `boarding` | BoardingRecord, AbsenceNotification |
| `tracking` | `tracking` | (tabelas mínimas — GPS vai pro Redis) |
| `trip` | `trip` | Trip, TripStudent |
| `shared` | `public` | Company (tenant root), Enums compartilhados |

---

## Trade-offs

### 1. Complexidade das Migrations

- **Com schemas:** Precisa garantir `CREATE SCHEMA IF NOT EXISTS` antes de qualquer migration. Prisma v7 lida com isso, mas migrations manuais (SQL raw) exigem qualificação `schema.table`.
- **Sem schemas:** `npx prisma migrate dev` e pronto.
- **Peso:** Baixo. Configuração inicial, não dor recorrente.

### 2. Foreign Keys Cross-Schema

- **Com schemas:** Uma `Trip` (schema `trip`) referenciando `Route` (schema `routing`) exige FK cross-schema. Prisma suporta, mas o schema file fica mais verboso com `@@schema()` em cada model.
- **Sem schemas:** Relações são diretas, sem qualificação.
- **Peso:** Médio. Cada relação entre contextos vira uma decisão explícita — bom para DDD, mas adiciona fricção para dev solo.

### 3. Tooling e DX (Developer Experience)

- **Com schemas:** Ferramentas como Prisma Studio, pgAdmin e queries manuais precisam especificar o schema (`SELECT * FROM boarding."BoardingRecord"`). Auto-complete pode não listar todos os schemas por padrão.
- **Sem schemas:** Tudo no `public`, qualquer ferramenta funciona sem configuração.
- **Peso:** Baixo. É costume, não limitação.

### 4. Prisma v7 — Maturidade do Multi-Schema

- **Com schemas:** O suporte a `@@schema()` está GA desde Prisma v4.x. Porém, continua sendo um arquivo `.prisma` único — apenas anotado com `@@schema("x")`.
- **Sem schemas:** Zero risco de edge cases no ORM.
- **Peso:** Baixo-Médio. Feature estável, mas é um nível de complexidade a mais na ponte ORM ↔ banco.

### 5. Seeding e Testes

- **Com schemas:** Seeds precisam respeitar a ordem de criação entre schemas (ex: `Company` no `public` antes de qualquer entidade nos demais). Testes de integração que fazem `TRUNCATE` precisam iterar sobre múltiplos schemas.
- **Sem schemas:** `TRUNCATE` de todas as tabelas num único schema é trivial.
- **Peso:** Médio. Afeta a rotina de testes, que é frequente.

### 6. Backup e Restore Parcial

- **Com schemas:** Pode fazer dump/restore por bounded context (`pg_dump --schema=boarding`). Útil para debug e para eventual extração de microserviço.
- **Sem schemas:** Dump é tudo ou nada.
- **Peso:** Positivo a favor dos schemas. Mais benefício que trade-off.

### 7. Overhead Cognitivo para Dev Solo

- **Com schemas:** Exige pensar "essa entidade pertence a qual schema?" ao criar models. Relações cross-context viram decisões arquiteturais explícitas.
- **Sem schemas:** Cria o model e segue. A separação é responsabilidade do código, não do banco.
- **Peso:** Médio. Para dev solo com prazo de MVP, cada fricção se multiplica.

### 8. Risco de Over-Engineering para MVP

- **Com schemas:** Se o sistema nunca escalar para microserviços, a separação terá sido custo sem retorno prático.
- **Sem schemas:** Mais simples, entrega mais rápido.
- **Peso:** Alto. Trade-off central — mitigado pelo objetivo acadêmico.

---

## Resumo

| Trade-off | Peso | Favorece |
|---|---|---|
| Complexidade de migrations | Baixo | Neutro |
| FKs cross-schema | Médio | Sem schemas |
| DX / tooling | Baixo | Sem schemas |
| Maturidade Prisma multi-schema | Baixo-Médio | Sem schemas |
| Seeding e testes | Médio | Sem schemas |
| Backup parcial | Baixo | Com schemas |
| Overhead cognitivo dev solo | Médio | Sem schemas |
| Risco de over-engineering | **Alto** | Depende do objetivo |

---

## Veredito

A maioria dos trade-offs pesa contra a separação no contexto de um MVP solo. Porém, dois fatores invertem a balança neste projeto:

1. **É um TCC** — demonstrar que os bounded contexts se refletem até na camada de dados é um argumento arquitetural forte para a defesa.
2. **O custo é front-loaded** — paga uma vez na configuração inicial, e a dor recorrente é baixa.

**Decisão final:** Adotar multi-schema. O retorno acadêmico e arquitetural compensa a fricção adicional.
