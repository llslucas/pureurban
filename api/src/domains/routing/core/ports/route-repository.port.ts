import { Context, Effect } from 'effect';
import type { RouteNotFoundError } from '../errors/routing.errors.js';

// Tipos de dados do domínio Routing — Effect TS puro, zero imports @nestjs/*

export interface RouteData {
  id: string;
  name: string;
  description: string | null;
  originCity: string;
  destinationCity: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRouteData {
  name: string;
  description?: string;
  originCity: string;
  destinationCity: string;
  companyId: string;
}

export interface RouteRepositoryApi {
  create(data: CreateRouteData): Effect.Effect<RouteData>;
  findAllByCompany(companyId: string): Effect.Effect<RouteData[]>;
  findByIdAndCompany(
    id: string,
    companyId: string,
  ): Effect.Effect<RouteData | null>;
  update(
    id: string,
    companyId: string,
    data: Partial<
      Omit<RouteData, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>
    >,
  ): Effect.Effect<RouteData, RouteNotFoundError>;
  remove(
    id: string,
    companyId: string,
  ): Effect.Effect<void, RouteNotFoundError>;
}

// Context Tag para injeção no Effect runtime
export class RouteRepository extends Context.Tag('RouteRepository')<
  RouteRepository,
  RouteRepositoryApi
>() {}
