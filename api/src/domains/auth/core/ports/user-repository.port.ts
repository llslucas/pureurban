import { Context, Effect } from 'effect'

export interface UserData {
  id: string
  email: string
  password: string
  name: string
  role: string
  companyId: string
  createdAt: Date
  updatedAt: Date
  isActive: boolean
}

export interface CreateUserInput {
  email: string
  password: string
  name: string
  role: string
  companyName: string
}

export interface CreateDriverData {
  email: string
  password: string
  name: string
  companyId: string
}

export interface UserRepository {
  readonly findByEmail: (email: string) => Effect.Effect<UserData | null>
  readonly findById: (id: string) => Effect.Effect<UserData | null>
  readonly create: (data: CreateUserInput) => Effect.Effect<UserData>
  readonly findManyByCompanyAndRole: (
    companyId: string,
    role: string,
    filter?: { isActive?: boolean }
  ) => Effect.Effect<UserData[]>
  readonly findByIdAndCompanyAndRole: (
    id: string,
    companyId: string,
    role: string
  ) => Effect.Effect<UserData | null>
  readonly updatePartial: (
    id: string,
    companyId: string,
    data: Partial<{ email: string; password: string; name: string; isActive: boolean }>
  ) => Effect.Effect<UserData>
  readonly createDriver: (data: CreateDriverData) => Effect.Effect<UserData>
}

export const UserRepository = Context.GenericTag<UserRepository>('UserRepository')
