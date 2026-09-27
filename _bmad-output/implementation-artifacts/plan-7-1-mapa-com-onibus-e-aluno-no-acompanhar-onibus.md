---
title: 'Mapa com ônibus e aluno no Acompanhar Ônibus (Story 7.1)'
type: 'feature'
ticket: '7-1-mapa-com-onibus-e-aluno-no-acompanhar-onibus'
created: '2026-09-27'
status: 'done'
baseline_revision: 'f8a34148192d676c4a40cacd65b996404ce7cd28'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** "Acompanhar ônibus" mostra só texto (ETA, distância, legenda). Para a apresentação do TCC queremos o ônibus e o aluno num mapa, polish da Fase 2 do PRD (evolução do FR32, Épico 7).

**Approach:** Um componente `BusMap` (`react-native-maps`, provider Google) acima do `BusEtaCard`, alimentado pelo mesmo `bus`/`studentPoint`/`gpsStale` que a tela já calcula. A variante `.web.tsx` não renderiza nada. A API key vem do ambiente em build, via `app.config.ts`. A key ainda não existe (o usuário a cria depois): tudo tem de funcionar sem ela, e a verificação nos AVDs fica como hitl.

## Boundaries & Constraints

**Always:** backend, contrato, `openapi.json` e a lógica de SSE/resync/degradado da 5.2 intocados; cores só via `useAppTheme().custom` (guarda de paleta verde); todo texto, `testID` e nome acessível existentes preservados; `app.json` continua sendo a fonte da identidade nativa (os guards `eas-config.guard.test.ts` e `palette.guard.test.ts` o leem); key nunca commitada.

**Never:** mapa no web; animação do marcador; estilo escuro do mapa; traçado de rota/paradas; persistir posições; `EXPO_PUBLIC_*` para a key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ao vivo, aluno com fix | `bus` + `studentPoint`, key configurada | mapa acima do card, 2 marcadores, câmera enquadra ambos | — |
| Novo `location.updated` | ônibus dentro da área visível | marcador salta; câmera parada | ônibus fora da área → câmera recentra |
| GPS degradado | `gpsStale` true | marcador do ônibus na última posição, atenuado | — |
| Permissão do aluno negada / sem fix | `studentPoint` null | só o marcador do ônibus; `LocationPermissionCard` como hoje | — |
| Aguardando / sem viagem / erro | `bus` null ou `StateView` | sem mapa | — |
| Sem key no build | `extra.googleMapsConfigured` false | `BusMap` não renderiza; tela igual à `main` | nunca instancia `MapView` (Google sem key derruba o app) |
| Expo Web | plataforma web | `bus-map.web.tsx` → null; Playwright inalterado | — |

</frozen-after-approval>

## Code Map

- `mobile/src/app/(student)/track-bus.tsx` -- tela; no render final (~l.392) inserir `<BusMap>` antes do `BusEtaCard`, passando `bus`, `studentPoint`, `gpsStale`. Não mexer em efeitos/estado.
- `mobile/src/components/track-bus/bus-eta-card.tsx` -- referência de estilo: `useThemedStyles(createStyles)`, `radius`/`spacing` de `@/lib/tokens`.
- `mobile/src/lib/geo.ts` -- tipo `GeoPoint` a reusar.
- `mobile/app.json` -- mantém-se; os guards leem o JSON cru.
- `mobile/.env.example` -- documentar a nova variável.
- `mobile/jest.setup.js` -- mocks globais (padrão do Reanimated); `jest-expo` roda como nativo, então todo teste que renderiza a tela importa `react-native-maps`.
- `mobile/src/track-bus-screen.test.tsx` -- matriz da tela (742 linhas); adicionar poucos casos de presença/ausência do mapa.
- `mobile/node_modules/expo/bundledNativeModules.json` -- SDK 55 fixa `react-native-maps` 1.27.2 (instalar com `npx expo install`).

## Tasks & Acceptance

**Execution:**
- [ ] `mobile/package.json` -- `npx expo install react-native-maps` -- versão casada com o SDK.
- [ ] `mobile/app.config.ts` -- novo; recebe `{ config }` (o `app.json`) e, se `GOOGLE_MAPS_ANDROID_API_KEY` existir, injeta a key (plugin do `react-native-maps` se ele expuser um; senão `android.config.googleMaps.apiKey`) e `extra.googleMapsConfigured: true`; sem key, `false` e nada injetado.
- [ ] `mobile/.env.example` -- bloco comentado da variável: não é `EXPO_PUBLIC`, restrita por package + SHA-1, exige rebuild do dev build, e em build EAS precisa estar nas env vars do EAS (`.env` não sobe).
- [ ] `mobile/src/lib/maps-config.ts` -- `isGoogleMapsConfigured()` lendo `Constants.expoConfig?.extra`; ponto único de mock nos testes.
- [ ] `mobile/src/components/track-bus/bus-map.tsx` -- `BusMap({ bus, student, stale, testID })`: null se não configurado; `MapView` de altura fixa com cantos do token, marcador do ônibus (cor de marca, `opacity` reduzida quando `stale`) e do aluno (se houver); enquadra ambos no primeiro layout e quando o aluno aparece; recentra só se o ônibus sair da região visível; `accessibilityLabel` descritivo.
- [ ] `mobile/src/components/track-bus/bus-map.web.tsx` -- mesma assinatura, retorna `null`.
- [ ] `mobile/jest.setup.js` -- mock global de `react-native-maps` (`MapView`/`Marker` como `View` repassando props, `PROVIDER_GOOGLE`, métodos de câmera como `jest.fn`).
- [ ] `mobile/src/components/track-bus/bus-map.test.tsx` -- matriz: 2 marcadores; 1 sem aluno; atenuado em stale; null sem key.
- [ ] `mobile/src/app/(student)/track-bus.tsx` + `mobile/src/track-bus-screen.test.tsx` -- montar o mapa; casos: mapa com posição e key; sem mapa aguardando posição; sem mapa sem key.

**Acceptance Criteria:**
- Given a suíte existente, when `npm test` roda, then todos os testes anteriores passam sem alteração de asserção.
- Given `npm run web` sem key, when a tela abre, then renderiza como na `main`, sem erro de bundle.
- Given o repositório, when se procura a key, then ela não aparece em nenhum arquivo versionado.

## Design Notes

`app.config.ts` fino sobre o `app.json`, e não uma migração, para que os dois guards continuem lendo a identidade nativa sem mudança:

```ts
export default ({ config }: ConfigContext): ExpoConfig => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY
  return { ...config, extra: { ...config.extra, googleMapsConfigured: Boolean(key) }, /* key injection */ }
}
```

A flag em `extra` existe porque o Google Maps sem key derruba o app nativo. Limite conhecido: um dev build gerado sem key, rodando contra um dev server que tem a key, vê a flag `true` e cai. Por isso o `.env.example` avisa que é preciso fazer rebuild.

## Verification

**Commands:**
- `cd mobile && npm test` -- expected: suíte verde, com os testes novos.
- `cd mobile && npm run lint` -- expected: sem erros.
- `cd mobile && npx tsc --noEmit` -- expected: sem erros (não rodar junto com Jest/Metro: WSL OOM).
- `cd mobile && npx expo config --type public` -- expected: `extra.googleMapsConfigured: false` sem key; com `GOOGLE_MAPS_ANDROID_API_KEY=x`, a key aparece no config nativo.

**Manual checks (hitl, depois da key):**
- Gerar um dev build novo com a key; nos AVDs, motorista61 transmitindo e aluno61 em "Acompanhar ônibus": mapa com os 2 marcadores, salto a cada update, atenuado após 15s sem sinal. Anexar a captura de tela aqui.

## Device Verification (hitl, 2026-09-27)

Dev build EAS `165f65aa-928a-4eac-9fe3-207f83d3a144` with `GOOGLE_MAPS_ANDROID_API_KEY` from the EAS `development` env (key restricted to `com.pureurban.mobile` + the EAS keystore SHA-1). `com.google.android.geo.API_KEY` confirmed in the APK manifest. A single AVD (emulator-5554, Android 16) logged in as aluno61. The driver side was simulated through the API (`POST /api/v1/tracking/location` with a driver JWT on the active RETURN trip `6a14735d-…`), and the student position was injected with shell test providers (gps/fused/network). Evidence: `C:\Users\lucas\Downloads\pureurban-7-1-evidencias\`.

| # | Check | Result |
|---|-------|--------|
| 1 | Map above the ETA card, bus (yellow) + student (blue), framed | ✅ `01-mapa-ao-vivo.png` — 1,5 km, ~3 min, "Ao vivo" |
| 2 | New `location.updated` inside the view: marker jumps, camera still | ✅ `02-onibus-andou-camera-parada.png` — 775 m, ~2 min |
| 3 | Vertical drag on the map | ✅ `03-arraste-vertical-move-o-mapa.png` — pans the map, the page does not scroll (the content fits) |
| 4 | 15s without a signal | ✅ `04-sem-sinal-marcador-atenuado.png` — chip "Sem sinal GPS", marker translucent at its last point |
| 5 | Bus outside the (panned) view | ✅ `05-onibus-fora-reenquadra.png` — reframes both points; back to "Ao vivo", marker opaque |

Not covered: dark theme on the map (out of scope) and a physical device.
