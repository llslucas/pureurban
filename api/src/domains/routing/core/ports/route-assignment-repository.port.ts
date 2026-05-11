import { Context, Effect } from 'effect';
import type {
  AssignmentAlreadyExistsError,
  AssignmentNotFoundError,
  RouteNotFoundError,
  UserNotFoundError,
} from '../errors/routing.errors.js';

// Tipos de dados do domínio Routing — sem imports @nestjs/*

export interface StudentAssignmentData {
  id: string;
  routeId: string;
  studentId: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface DriverAssignmentData {
  id: string;
  routeId: string;
  driverId: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface RouteAssignedData {
  id: string;
  name: string;
  description: string | null;
  originCity: string;
  destinationCity: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RouteAssignmentRepositoryApi {
  assignStudent(
    routeId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<
    { id: string; routeId: string; studentId: string; createdAt: Date },
    RouteNotFoundError | UserNotFoundError | AssignmentAlreadyExistsError
  >;

  unassignStudent(
    routeId: string,
    studentId: string,
    companyId: string,
  ): Effect.Effect<void, AssignmentNotFoundError>;

  findStudentsByRoute(
    routeId: string,
    companyId: string,
  ): Effect.Effect<StudentAssignmentData[]>;

  assignDriver(
    routeId: string,
    driverId: string,
    companyId: string,
  ): Effect.Effect<
    { id: string; routeId: string; driverId: string; createdAt: Date },
    RouteNotFoundError | UserNotFoundError | AssignmentAlreadyExistsError
  >;

  unassignDriver(
    routeId: string,
    driverId: string,
    companyId: string,
  ): Effect.Effect<void, AssignmentNotFoundError>;

  findDriversByRoute(
    routeId: string,
    companyId: string,
  ): Effect.Effect<DriverAssignmentData[]>;

  findRoutesByDriver(
    driverId: string,
    companyId: string,
  ): Effect.Effect<RouteAssignedData[]>;

  findRoutesByStudent(
    studentId: string,
    companyId: string,
  ): Effect.Effect<RouteAssignedData[]>;
}

// Context Tag para injeção no Effect runtime
export class RouteAssignmentRepository extends Context.Tag(
  'RouteAssignmentRepository',
)<RouteAssignmentRepository, RouteAssignmentRepositoryApi>() {}
