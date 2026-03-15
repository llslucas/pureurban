# Decisão Adicional: Domain Events Funcionais

### Padrão Adotado: Return Tuple (`WithEvents<A>`)

**Decisão:** O functional core nunca emite eventos diretamente (side effect). Em vez disso, retorna uma tupla `[resultado, eventos[]]`. O imperative shell recebe os eventos puros e os despacha via `EventEmitter2` do NestJS.

**Rationale:** Emitir eventos dentro do core quebraria a premissa fundamental do Functional Core / Imperative Shell (BERNHARDT, 2012) — o core deve ser puro, determinístico, sem side effects. Com a tupla, o core *decide quais eventos ocorreram*, e o shell *executa o dispatch*.

**Interface (Shared Kernel — `core/events/`):**

```typescript
// domains/shared/core/events/domain-event.interface.ts
interface DomainEvent {
  readonly type: string
  readonly data: Record<string, unknown>
  readonly occurredAt: string  // ISO 8601
}

// domains/shared/core/events/with-events.ts
type WithEvents<A> = readonly [result: A, events: ReadonlyArray<DomainEvent>]

const noEvents = <A>(result: A): WithEvents<A> => [result, []] as const
const withEvents = <A>(result: A, events: DomainEvent[]): WithEvents<A> =>
  [result, events] as const
```

**Use Case (core/ — puro):**

```typescript
const checkIn = (studentId: string, tripId: string) =>
  Effect.gen(function* () {
    const repo = yield* BoardingRepository
    const boarding = yield* repo.recordCheckIn(studentId, tripId)
    return withEvents(boarding, [
      { type: 'boarding.checked_in', data: { studentId, tripId }, occurredAt: new Date().toISOString() }
    ])
  })
```

**Shell (NestJS — side effects):**

```typescript
@Injectable()
class BoardingService {
  constructor(
    @Inject('EFFECT_RUNTIME') private readonly runtime: ManagedRuntime<...>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processCheckIn(dto: CheckInDto) {
    const [result, events] = await this.runtime.runPromise(
      checkIn(dto.studentId, dto.tripId)
    )
    events.forEach(e => this.eventEmitter.emit(e.type, e))
    return result
  }
}
```

**Helper para dispatch automático (`shared/shell/effect-runtime/`):**

```typescript
@Injectable()
class EffectEventDispatcher {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async runAndDispatch<A, E, R>(
    runtime: ManagedRuntime<R>,
    program: Effect<WithEvents<A>, E, R>,
  ): Promise<A> {
    const [result, events] = await runtime.runPromise(program)
    events.forEach(e => this.eventEmitter.emit(e.type, e))
    return result
  }
}
```

**Benefícios:**
- Core 100% puro — zero side effects, mesma entrada → mesma saída sempre
- Testabilidade: `expect(events).toContain(...)` sem mocks de EventEmitter
- Transacionalidade: shell só emite se o programa Effect completous com sucesso
- Determinismo: perfeito para demonstração acadêmica no TCC

**Eventos do PureUrban:**

| Evento | Domínio Emissor | Consumidor |
|---|---|---|
| `boarding.checked_in` | boarding | tracking (atualiza contagem) |
| `boarding.not_returning` | boarding | trip (atualiza lista) |
| `boarding.absence_cancelled` | boarding | trip (reverte status) |
| `trip.started` | trip | tracking (inicia GPS stream) |
| `trip.ended` | trip | tracking (para GPS stream) |
| `location.updated` | tracking | SSE controller (push para alunos) |

**Arquivos adicionados à estrutura:**
- `domains/shared/core/events/domain-event.interface.ts`
- `domains/shared/core/events/with-events.ts`
- `domains/shared/shell/effect-runtime/event-dispatcher.service.ts`
