import type { DomainEvent } from './domain-event.interface.js';

export type WithEvents<A> = readonly [
  result: A,
  events: ReadonlyArray<DomainEvent>,
];

export const noEvents = <A>(result: A): WithEvents<A> => [result, []] as const;

export const withEvents = <A>(
  result: A,
  events?: ReadonlyArray<DomainEvent> | null,
): WithEvents<A> => [result, events ?? []] as const;
