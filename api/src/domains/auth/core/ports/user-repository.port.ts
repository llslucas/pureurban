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
}

export interface CreateUserInput {
  email: string
  password: string
  name: string
  role: string
  companyName: string
}

export interface UserRepository {
  readonly findByEmail: (email: string) => Effect.Effect<UserData | null>
  readonly findById: (id: string) => Effect.Effect<UserData | null>
  readonly create: (data: CreateUserInput) => Effect.Effect<UserData>
}

export const UserRepository = Context.GenericTag<UserRepository>('UserRepository')
