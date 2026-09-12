import {
  etaMinutes,
  formatDistance,
  formatEta,
  haversineDistanceMeters,
} from '@/lib/geo'

// Pure geometry/format coverage (spec-5-2, OQ-1): the screen computes the
// bus→student distance locally with haversine and presents ETA as text at a
// constant ~25 km/h. The screen tests mock the whole service layer, so this
// file is the only place these rules are locked.

// Viçosa/MG → pontos próximos, distâncias verificáveis à mão.
const BUS = { latitude: -20.755549, longitude: -42.881728 }
const STUDENT_NEARBY = { latitude: -20.7565, longitude: -42.8827 }
const SAME_POINT = { latitude: BUS.latitude, longitude: BUS.longitude }

describe('haversineDistanceMeters', () => {
  it('mesmo ponto: distância zero', () => {
    expect(haversineDistanceMeters(BUS, SAME_POINT)).toBe(0)
  })

  it('pontos próximos: distância coerente em metros (~140 m)', () => {
    const distance = haversineDistanceMeters(BUS, STUDENT_NEARBY)
    // 1 décimo de grau é ~111m; aqui é ~0.001 grau em cada eixo.
    expect(distance).toBeGreaterThan(100)
    expect(distance).toBeLessThan(200)
  })

  it('é simétrica', () => {
    expect(haversineDistanceMeters(BUS, STUDENT_NEARBY)).toBeCloseTo(
      haversineDistanceMeters(STUDENT_NEARBY, BUS),
      6,
    )
  })

  it('distâncias maiores: ordem de grandeza correta (Viçosa → BH ≈ 144 km)', () => {
    const bh = { latitude: -19.9167, longitude: -43.9345 }
    const distance = haversineDistanceMeters(BUS, bh)
    expect(distance).toBeGreaterThan(120_000)
    expect(distance).toBeLessThan(180_000)
  })
})

describe('formatDistance', () => {
  it('abaixo de 1 km: metros arredondados', () => {
    expect(formatDistance(87.4)).toBe('87 m')
    expect(formatDistance(999.4)).toBe('999 m')
  })

  it('fronteira: 999,5+ arredonda para o ramo em km — nunca "1000 m"', () => {
    expect(formatDistance(999.6)).toBe('1,0 km')
    expect(formatDistance(999.5)).toBe('1,0 km')
    expect(formatDistance(999.49)).toBe('999 m')
  })

  it('a partir de 1 km: uma casa decimal com vírgula (pt-BR)', () => {
    expect(formatDistance(1_000)).toBe('1,0 km')
    expect(formatDistance(12_345)).toBe('12,3 km')
  })
})

describe('etaMinutes / formatEta (ETA a ~25 km/h)', () => {
  it('25 km → ~60 min', () => {
    expect(etaMinutes(25_000)).toBe(60)
  })

  it('mínimo de 1 min — distâncias pequenas não viram 0 min', () => {
    expect(etaMinutes(50)).toBe(1)
  })

  it('abaixo de ~100 m: "Chegando" — minutos seriam falsa precisão', () => {
    expect(formatEta(0)).toBe('Chegando')
    expect(formatEta(99.9)).toBe('Chegando')
  })

  it('a partir de 100 m: minutos a ~25 km/h em texto', () => {
    // 100 m a 416,7 m/min ≈ 0,24 min → arredonda para 1 (mínimo).
    expect(formatEta(100)).toBe('~1 min')
    // 4_167 m ≈ 10 min.
    expect(formatEta(4_167)).toBe('~10 min')
  })
})
