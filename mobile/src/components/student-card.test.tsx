import { render, screen } from '@testing-library/react-native'
import React from 'react'

import { STATUS_PRESENTATION, StudentCard } from '@/components/student-card'
import type { BoardingStatus, TripStudentItem } from '@/services/trip.service'

// O card é a única superfície que traduz `status` do contrato em algo que o
// motorista lê de relance. Sem este teste, trocar um rótulo ou apagar a linha de
// horário passa em silêncio.

function makeStudent(overrides: Partial<TripStudentItem> = {}): TripStudentItem {
  return {
    studentId: '660e8400-e29b-41d4-a716-446655440010',
    name: 'Ana Souza',
    status: 'NOT_CHECKED_IN',
    checkedInAt: null,
    ...overrides,
  }
}

describe('StudentCard', () => {
  it('renderiza o rótulo correto para cada status', () => {
    const { rerender } = render(<StudentCard student={makeStudent({ status: 'CHECKED_IN', checkedInAt: '2026-07-12T21:10:00.000Z' })} />)
    expect(screen.getByText(/Embarcou/)).toBeTruthy()

    rerender(<StudentCard student={makeStudent({ status: 'NOT_CHECKED_IN' })} />)
    expect(screen.getByText(/Não embarcou/)).toBeTruthy()

    rerender(<StudentCard student={makeStudent({ status: 'NOT_RETURNING' })} />)
    expect(screen.getByText(/Não vai voltar/)).toBeTruthy()
  })

  it('distingue os status por texto, não só por cor (AC #1, NFR18)', () => {
    const labels = new Set(Object.values(STATUS_PRESENTATION).map((p) => p.label))
    expect(labels.size).toBe(Object.keys(STATUS_PRESENTATION).length)
    for (const p of Object.values(STATUS_PRESENTATION)) {
      expect(p.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('CHECKED_IN com checkedInAt mostra o horário local', () => {
    const iso = '2026-07-12T21:10:00.000Z'
    const expected = new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    render(<StudentCard student={makeStudent({ status: 'CHECKED_IN', checkedInAt: iso })} />)
    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('NOT_CHECKED_IN e NOT_RETURNING não renderizam linha de horário', () => {
    const timeRe = /^\d{1,2}:\d{2}/
    const { rerender } = render(<StudentCard student={makeStudent({ status: 'NOT_CHECKED_IN' })} />)
    expect(screen.queryByText(timeRe)).toBeNull()

    rerender(<StudentCard student={makeStudent({ status: 'NOT_RETURNING' })} />)
    expect(screen.queryByText(timeRe)).toBeNull()
  })

  it('um status desconhecido (contrato antigo no cache) não derruba o card', () => {
    const rogue = makeStudent({ status: 'SOMETHING_NEW' as unknown as TripStudentItem['status'] })
    expect(() => render(<StudentCard student={rogue} />)).not.toThrow()
  })

  it('checkedInAt não-parseável não renderiza "Invalid Date"', () => {
    render(<StudentCard student={makeStudent({ status: 'CHECKED_IN', checkedInAt: 'not-a-date' })} />)
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
  })

  it('expõe um rótulo de acessibilidade único combinando nome e status', () => {
    render(<StudentCard student={makeStudent({ name: 'Bruno Lima', status: 'NOT_CHECKED_IN' })} />)
    expect(screen.getByLabelText('Bruno Lima, Não embarcou')).toBeTruthy()
  })

  it('STATUS_PRESENTATION cobre todo o union de status do contrato', () => {
    // `Record<BoardingStatus, true>`: um status novo no contrato quebra o
    // typecheck deste teste (chave faltando), não a tela.
    const expectedStatuses: Record<BoardingStatus, true> = {
      CHECKED_IN: true,
      NOT_CHECKED_IN: true,
      NOT_RETURNING: true,
    }
    for (const status of Object.keys(expectedStatuses) as BoardingStatus[]) {
      expect(STATUS_PRESENTATION[status]).toBeDefined()
    }
    expect(Object.keys(STATUS_PRESENTATION).sort()).toEqual(Object.keys(expectedStatuses).sort())
  })
})
