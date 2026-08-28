import { authHandlers } from './auth.handlers'
import { routesHandlers } from './routes.handlers'
import { tripHandlers } from './trip.handlers'
import { boardingHandlers } from './boarding.handlers'

export const handlers = [...authHandlers, ...routesHandlers, ...tripHandlers, ...boardingHandlers]
