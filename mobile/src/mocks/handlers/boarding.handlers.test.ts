/**
 * @jest-environment node
 */
import { setupServer } from 'msw/node'

import {
  boardingHandlers,
  MOCK_ACTIVE_TRIP_ID,
  resetBoardingMocks,
} from '@/mocks/handlers/boarding.handlers'

// The app mounts these handlers with msw/native; under Jest, msw/node
// intercepts the global fetch the same way, so the handler runs as in the app.
const server = setupServer(...boardingHandlers)

const BASE = 'http://mock.local/api/v1'
const ANA = '660e8400-e29b-41d4-a716-446655440010'
const DIEGO_NOT_RETURNING = '660e8400-e29b-41d4-a716-446655440013'

type Summary = { boarded: number; total: number }

async function summary(): Promise<Summary> {
  const response = await fetch(`${BASE}/trips/${MOCK_ACTIVE_TRIP_ID}/students`)
  expect(response.status).toBe(200)
  const body = (await response.json()) as { data: { summary: Summary } }
  return body.data.summary
}

async function checkIn(studentId: string, key: string) {
  const response = await fetch(`${BASE}/boarding/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
    body: JSON.stringify({ studentId, tripId: MOCK_ACTIVE_TRIP_ID }),
  })
  expect(response.status).toBe(201)
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => resetBoardingMocks())
afterAll(() => server.close())

describe('GET /trips/:id/students — summary (story 6.12 mock, R7c)', () => {
  it('total leaves the NOT_RETURNING student out; boarded counts only CHECKED_IN', async () => {
    // Seed roster: 3 NOT_CHECKED_IN + 1 NOT_RETURNING.
    expect(await summary()).toEqual({ boarded: 0, total: 3 })

    await checkIn(ANA, 'key-ana')

    expect(await summary()).toEqual({ boarded: 1, total: 3 })
  })

  it('a NOT_RETURNING student who boards counts on both sides, like the API', async () => {
    await checkIn(DIEGO_NOT_RETURNING, 'key-diego')

    expect(await summary()).toEqual({ boarded: 1, total: 4 })
  })
})
