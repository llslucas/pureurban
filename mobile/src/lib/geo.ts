// Geometria local do acompanhamento (Story 5.2): sem coordenada de parada no
// modelo (não há Stop; Route só cidades), a distância ônibus→aluno é calculada
// no device com haversine sobre a posição capturada do próprio aluno.

export interface GeoPoint {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_M = 6_371_000

// Velocidade média constante do ônibus (~25 km/h): heurística deliberada — o
// ETA é texto de conforto, não navegação. Sem promessa de precisão.
const AVERAGE_BUS_SPEED_KMH = 25

const toRad = (degrees: number): number => (degrees * Math.PI) / 180

/** Distância great-circle em metros entre dois pontos WGS84. */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distância em texto curto: metros abaixo de 1 km, km com 1 casa acima. */
export function formatDistance(meters: number): string {
  // Arredonda ANTES de escolher o ramo: 999,6 m arredonda para 1 km — exibir
  // "1000 m" ao lado de um ETA de "chegando" seria o pior dos dois mundos.
  const rounded = Math.round(meters)
  if (rounded < 1_000) {
    return `${rounded} m`
  }
  const km = (rounded / 1_000).toFixed(1).replace('.', ',')
  return `${km} km`
}

/** Minutos de ônibus a ~25 km/h para cobrir a distância dada. */
export function etaMinutes(distanceMeters: number): number {
  const speedMetersPerMinute = (AVERAGE_BUS_SPEED_KMH * 1_000) / 60
  return Math.max(1, Math.round(distanceMeters / speedMetersPerMinute))
}

/**
 * ETA em texto: abaixo de ~100 m o ônibus já está chegando — minutos
 * restantes seriam falsa precisão (é menos de 15s a 25 km/h).
 */
export function formatEta(distanceMeters: number): string {
  if (distanceMeters < 100) return 'Chegando'
  return `~${etaMinutes(distanceMeters)} min`
}
