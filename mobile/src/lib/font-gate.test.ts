import { isFontGateOpen } from '@/lib/font-gate'

describe('isFontGateOpen', () => {
  it('fica fechado enquanto as fontes carregam', () => {
    expect(isFontGateOpen(false, null)).toBe(false)
  })

  it('abre quando as fontes carregam', () => {
    expect(isFontGateOpen(true, null)).toBe(true)
  })

  it('abre mesmo com falha de carregamento', () => {
    expect(isFontGateOpen(false, new Error('network'))).toBe(true)
  })
})
