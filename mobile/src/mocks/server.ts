// setupServer vem de msw/native — NUNCA msw/node, que patcha http/https do
// Node e não existem no React Native (crasha o app).
import { setupServer } from 'msw/native'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
