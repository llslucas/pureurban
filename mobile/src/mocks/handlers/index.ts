import { authHandlers } from './auth.handlers'
import { routesHandlers } from './routes.handlers'
import { boardingHandlers } from './boarding.handlers'

export const handlers = [...authHandlers, ...routesHandlers, ...boardingHandlers]
