import { apiClient } from './api-client'

export type UserRole = 'ADMIN' | 'DRIVER' | 'STUDENT'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export const authService = {
  login: (email: string, password: string) =>
    apiClient.post<AuthTokens>('/api/v1/auth/login', { email, password }),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthTokens>('/api/v1/auth/refresh', { refreshToken }),
}
