import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tranca a identidade EAS/nativa da Story 1.7 (mesma técnica do lock de
// app.json no palette.guard.test.ts, mas no eixo do build): tsc/lint/jest
// não enxergam config nativa, então renomear `android.package`, perder o
// `extra.eas.projectId`, derrubar a permissão de câmera/GPS ou virar um
// profile do `eas.json` só falharia silenciosamente no próximo build EAS
// pago. Estes locks fazem a falha acontecer aqui, de graça.

const MOBILE_ROOT = join(__dirname, '..', '..')

const appConfig = JSON.parse(readFileSync(join(MOBILE_ROOT, 'app.json'), 'utf8')) as {
  expo: {
    android: { package: string; permissions: string[] }
    extra: { eas: { projectId: string } }
  }
}

const easConfig = JSON.parse(readFileSync(join(MOBILE_ROOT, 'eas.json'), 'utf8')) as {
  build: {
    development: { developmentClient?: boolean; distribution: string; android: { buildType: string } }
    preview: { developmentClient?: boolean; distribution: string; android: { buildType: string } }
  }
}

describe('guarda — identidade EAS e build nativo (Story 1.7)', () => {
  it('app.json: android.package fixado em com.pureurban.mobile (identidade do APK)', () => {
    expect(appConfig.expo.android.package).toBe('com.pureurban.mobile')
  })

  it('app.json: extra.eas.projectId é o id comitado do eas init — nunca regenerar', () => {
    expect(appConfig.expo.extra.eas.projectId).toBe('53e555d5-ff74-418d-911f-ecf95e459126')
  })

  it('app.json: permissões de câmera e localização presentes (scan do QR + GPS da viagem)', () => {
    const permissions = appConfig.expo.android.permissions
    expect(permissions).toContain('android.permission.CAMERA')
    expect(permissions).toContain('android.permission.ACCESS_COARSE_LOCATION')
    expect(permissions).toContain('android.permission.ACCESS_FINE_LOCATION')
  })

  it('eas.json: profile development = dev client + APK interno (validação nativa)', () => {
    const profile = easConfig.build.development
    expect(profile.developmentClient).toBe(true)
    expect(profile.distribution).toBe('internal')
    expect(profile.android.buildType).toBe('apk')
  })

  it('eas.json: profile preview = APK interno SEM dev client (senão o boot do NFR5 mede o Metro, não o app)', () => {
    const profile = easConfig.build.preview
    expect(profile.developmentClient).toBeUndefined()
    expect(profile.distribution).toBe('internal')
    expect(profile.android.buildType).toBe('apk')
  })
})
