# Deferred Work

## Deferred from: code review of 1-3-setup-effect-ts-e-composition-root.md (2026-04-03)
- Query manual `SELECT 1 as health` no health-check pode ser frágil (aceito como prova de conceito inicial)
- `DomainEvent.occurredAt` é `string` genérica (poderia usar Branded Type no futuro para maior segurança de domínio)
- Missing Effect Composition Primitives in WithEvents
- Typed Errors are Eviscerated
- Reckless Synchronous Event Dispatching
- Potentially Hanging Module Teardown
- Sloppy, Untyped Domain Events payload
- queryResult array exists but lacks expected health shape
- Health check bypasses event dispatcher entirely — too much complexity for a simple health check program
- Apathetic Process Teardown — onModuleDestroy swallows runtime disposal failures into a log instead of failing loudly. — deferred: Unecessary now due to complexity

## Deferred from: code review of 1-5-setup-mobile-dependencias-e-configuracao-offline.md (2026-04-05)
- Omitted SafeAreaProvider Integration [`mobile/src/app/_layout.tsx`] — deferred, pre-existing
