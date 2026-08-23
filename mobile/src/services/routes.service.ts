import { apiClient } from './api-client'

// Dados de rota atribuída ao usuário autenticado (sem companyId — stripping no backend)
export interface AssignedRoute {
  id: string
  name: string
  description: string | null
  originCity: string
  destinationCity: string
  createdAt: string
  updatedAt: string
}

export const routesService = {
  getMyRoutes: (): Promise<AssignedRoute[]> => apiClient.get<AssignedRoute[]>('/api/v1/routes/mine'),
}
