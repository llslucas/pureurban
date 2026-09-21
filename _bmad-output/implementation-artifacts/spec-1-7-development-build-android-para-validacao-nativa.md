---
title: 'Story 1.7: Development Build Android para Validação Nativa'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: dd7358524520789ace74b02851e860bfea77e600
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O app só foi validado no alvo web (Story 1.6), onde MMKV é `localStorage`, SQLite é wa-sqlite/OPFS e câmera é webcam — o substrato nativo e os NFRs de device (NFR5, NFR18–NFR20) seguem sem validação real, e a defesa do TCC exige device.

**Approach:** Instalar `expo-dev-client`, criar `mobile/eas.json` com o profile `development` (APK interno), gerar o APK via EAS, rodá-lo no emulador Android do Windows conectado ao dev server por `adb reverse`, validar MMKV/SQLite nativos, leitura de QR pela câmera e medir o boot (NFR5), documentando o fluxo no README.

**Decisions (2026-09-20):**
- Build na **nuvem EAS** (`eas build -p android --profile development`), com conta Expo gratuita (`eas login` / `eas init`).
- `android.package`: **`com.pureurban.mobile`**.

## Boundaries & Constraints

**Always:**
- O profile `development` produz **APK** (`buildType: "apk"`, `distribution: "internal"`) — instalável direto no emulador, sem loja e sem AAB.
- A identidade do projeto EAS (projectId do `eas init` em `app.json`) é comitada uma vez e mantida estável.
- Toda mudança fica em config/docs do mobile: `package.json`, `app.json`, `eas.json`, `README.md`, `.env.example`. Nenhum arquivo de UI, store, service ou hook é tocado.
- A medição do boot é registrada com método e número reais — inclusive se o emulador não cumprir os 3s (vira achado, não falha da story).

**Never:**
- Expo Go não é alvo em nenhum passo.
- Não atualizar dependências além de `expo-dev-client` + `eas-cli`: os ~17 avisos de drift do `expo start` são pré-existentes e fora de escopo.
- Nada de iOS: sem conta Apple, sem macOS, sem signing iOS.
- Não publicar em loja (Play Console), não gerar AAB, não configurar CI.
- Não tocar em `metro.config.js` (patch COOP/COEP é só do alvo web), `src/utils/constants.ts` (fallback `10.0.2.2` já correto para emulador), mocks nem `_layout.tsx`.

</frozen-after-approval>

## Code Map

- `mobile/app.json` — hoje **sem** `android.package` e sem `extra.eas.projectId`; plugins já declaram expo-camera/expo-sqlite/expo-location com permissões pt-BR. Recebe `android.package` + projectId.
- `mobile/package.json` — sem `expo-dev-client` e sem `eas-cli`; `npm run web` fixa porta 8081; jest + jest-expo existem (Story 1.10). Recebe as duas dependências.
- `mobile/eas.json` — não existe; será criado com os profiles `development` e `preview`.
- `mobile/src/utils/constants.ts` — NÃO TOCAR: em `__DEV__` cai em `http://10.0.2.2:3000` (alias do host no emulador — exatamente o fluxo desta story); em produção rejeita host local.
- `mobile/metro.config.js` — NÃO TOCAR: patch http/https + `wasm` em `assetExts` são específicos do alvo web; inofensivos no nativo.
- `mobile/src/app/_layout.tsx` + `src/lib/storage.ts` + `src/lib/database.ts` — caminho de boot onde MMKV (Nitro) e SQLite nativo serão exercitados; NÃO ALTERAR, apenas verificar em execução.
- `mobile/README.md` — seções atuais cobrem só o alvo web; ganha seção "Development build Android".
- `mobile/.env.example` — já orienta "emulador Android → deixar comentada, fallback 10.0.2.2"; ganha nota curta sobre `adb reverse` (alternativa `localhost:3000`).

## Tasks & Acceptance

**Execution:**
- [x] `mobile/package.json` — `npx expo install expo-dev-client` (versão casada com o SDK 55); `eas-cli` como devDependency (ou global, conforme resposta do Open Question do build) — pré-requisito da AC #1.
- [x] `mobile/eas.json` — NEW: profile `development` (`developmentClient: true`, `distribution: "internal"`, `android.buildType: "apk"`) e profile `preview` (APK release, sem dev client) — este último é o veículo honesto da medição do NFR5, pois build de dev baixa o bundle do Metro e não mede boot real — ACs #1 e #6.
- [x] `mobile/app.json` — `android.package` escolhido no Open Question; `extra.eas.projectId` via `eas init` — identidade do build. **[projectId `73144243-…` commitado em `5c4dc94`]**
- [x] Builds — `eas build -p android --profile development` → APK de validação; `--profile preview` → APK de medição de boot; instalar no emulador Windows via `adb install` — ACs #2 e #6. **[Ambos FINISHED e instalados; APKs em `C:\Users\lucas\Downloads\`]**
- [x] Verificação nativa (roteiro manual) — `adb reverse tcp:8081 tcp:8081` + `tcp:3000 tcp:3000`; `npx expo start --dev-client`; validar MMKV nativo, SQLite nativo (`offline_queue`), QR pela câmera do emulador, sessão sobrevivendo a restart do processo — ACs #3–#5. **[TUDO VERIFICADO — QR lido pela câmera do emulador com viagem ativa; check-in do aluno disparou; confirmação do Lucas em 21/09/2026]**
- [x] `mobile/README.md` — seção Android: pré-requisitos (conta Expo, eas-cli, adb/AVD), build, install, `adb reverse`, dev server, câmera do emulador, limitações — AC #7.
- [x] Portões — `npx tsc --noEmit`, `npm run lint`, `npm test` no mobile; auditoria de diff contra a lista de arquivos declarada. **[tsc: 3 erros pré-existentes no baseline (ver Implementation Notes); lint limpo; 26 suítes / 348 testes verdes; diff = só os arquivos declarados]**

**Acceptance Criteria:**
- Given o projeto mobile, when a story é implementada, then `expo-dev-client` está instalado e `mobile/eas.json` define o profile `development` que produz APK interno (AC #1).
- Given uma conta EAS autenticada, when `eas build -p android --profile development` roda, then o build completa e devolve um APK instalável (AC #2).
- Given o APK instalado no emulador Android no Windows, when `adb reverse` está ativo e o dev server roda, then o app carrega o bundle e alcança a tela de login contra a API local (AC #3).
- Given o app rodando nativo, when o boot executa, then MMKV opera via Nitro/mmap e expo-sqlite abre o banco nativo com `offline_queue` — nenhum shim web em ação (AC #4).
- Given a câmera do emulador, when um QR de aluno é apresentado, then `/scan` lê e dispara o fluxo de check-in (AC #5).
- Given um cold start do APK `preview`, when o boot é medido (`adb logcat` "Displayed" + confirmação de tela operacional), then o número e o método são registrados; alvo < 3s (NFR5) (AC #6).
- Given um segundo desenvolvedor, when ele lê o README, then replica build → install → dev server sem instruções orais (AC #7).
- Given o fluxo inteiro, when executado, then nenhuma conta Apple nem hardware macOS foi necessária (AC #8).

## Implementation Notes

- **Branch:** `feat/1-7-development-build-android` (a partir de `main` @ `dd73585`). Commits: `41a7749` (deps), `43afa56` (eas.json + app.json), `d80e171` (README + .env.example). Sem PR aberto — aguarda aprovação do Lucas (regra do AGENTS.md).
- **`eas-cli` como devDependency** (`^24.7.0`): a spec remeteu à resposta do Open Question do build, que foi encerrada na nuvem EAS; escolhido devDependency por reprodutibilidade (`npx eas` funciona sem instalação global — documentado no README).
- **tsc com 3 erros PRÉ-EXISTENTES:** `src/app/(driver)/scan.tsx:315`, `src/hooks/use-trip-gps-capture.test.tsx:92`, `src/services/tracking-stream.service.test.ts:172`. Provados no baseline `dd73585` via worktree descartável — nenhum deles está em arquivo tocado por esta story (o diff não mexe em `src/`). O critério "0 erros" da seção Verification nunca valeu para o baseline atual; critério aplicado: **zero regressão vs. baseline** (mesmo padrão do review da 1.6). Dívida pequena e real — candidata a story técnica.
- **Diff auditado** (unificado, incluindo não-rastreados): exatamente `mobile/package.json` + lockfile, `mobile/eas.json` (novo), `mobile/app.json`, `mobile/README.md`, `mobile/.env.example` + artefatos BMAD (spec, epic-context, sprint-status). Zero mudanças em `mobile/src/`, `metro.config.js` ou `constants.ts`.
- **Pendente (exige o Lucas):** `npx eas login` + `npx eas init` (projectId comitado uma vez), os dois builds EAS (free tier), e o roteiro manual no emulador do Windows — ACs #2–#6. O `adb` relevante é o do Windows (`adb.exe` encontrado em `C:\Users\lucas\AppData\Local\Android\Sdk\platform-tools\`).
- **Execução real (20-21/09/2026), registrada após o fato:**
  - **AC #2 ✓** — builds EAS FINISHED: `development` (250MB) e `preview` (132MB), ambos `distribution: INTERNAL`. APKs baixados para `C:\Users\lucas\Downloads\`.
  - **AC #3 ✓** — dev client carregou o bundle do Metro do Lucas (porta 8081) via `adb reverse`; login `admin@pureurban.dev` contra a API local (`PORT=3001`, api/.env) → `/(admin)/home` ("Painel Administrativo"), roteamento por papel OK. Verificado por screenshot.
  - **AC #4 ✓** — SQLite nativo: `files/SQLite/pureurban.db` (16KB) no armazenamento privado via `run-as`. MMKV nativo: `am force-stop` + relançamento → sessão hidratada direto para o Painel, sem login (substrato Nitro/mmap, sem `localStorage`). Verificado por screenshot.
  - **AC #6 ✓** — NFR5 no APK `preview` (release, bundle embutido): cold start → `ActivityTaskManager: Displayed … +794ms` (método: `adb logcat -d | grep displayed` após `force-stop`; ambiente: emulador Medium Phone API 36 no Windows). **Muito abaixo dos 3s.** Ressalva honesta: emulador moderno ≠ Android 8+ de entrada; número registrado como evidência, não como certificação de device físico.
  - **AC #5 ✓ (21/09/2026)** — cadeia de negócio semeada via API pela story: rota "Rota Teste 17" (Curitiba→Fazenda Rio Grande) + vínculos motorista17 e aluno17 + viagem `OUTBOUND` ACTIVE (`c8bfb15a-…`, iniciada pelo papel DRIVER — o `POST /trips` é restrito a DRIVER pelo `RolesGuard`, 403 para ADMIN). QR apresentado à câmera do emulador → decode do payload → **check-in do aluno disparou com sucesso**. A conexão caiu no meio (regras de reverse mortas, ver achado de ambiente) e o app sincronizou após recriá-las com o script do README — comportamento de recuperação exercitado de facto.
  - **AC #7 ✓ / AC #8 ✓** — README entregue; fluxo inteiro sem Apple/macOS.
- **Achados de ambiente (não são código):** (1) o emulador do Lucas tinha 6GB cheios (apps de faculdade removidos; wipe-data com disco elevado a 12GB); (2) o `adb reverse` some quando o servidor adb reinicia — recriar as duas regras antes de cada sessão; (3) `localhost:3001` só ficou alcançável do Windows via loopback espelhado (WSL mirrored) — a API precisa estar no ar (`cd api && npm run start:dev`); (4) AVD registra o nome `Medium_Phone_API_36.0` (`.ini`), não `Medium_Phone`; (5) `tsc` com 3 erros pré-existentes no baseline (item anterior).

## Spec Change Log

## Review Triage Log

| # | Camada(s) | Achado | Veredito | Evidência / Encaminhamento |
|---|---|---|---|---|
| 1 | blind + edge + verif-gap | Troubleshooting do README fixa porta 3001; resto do doc e default da API usam 3000 | medium | Real: leitor com config default recriaria regra morta. Correção direta (doc) → **patch G2** |
| 2 | blind + edge | README hardcode `C:\Users\lucas\...adb.exe` | medium | Real: quebra AC #7 para segundo dev. Correção direta (`%LOCALAPPDATA%`) → **patch G2** |
| 3 | blind | Roteiro promete NFR18–NFR20 mas não tem passo nenhum para eles | low | Real: gap doc; correção direta (bullet do AVD 5" 720p) → **patch G2** |
| 4 | edge | `eas init` incondicional; segundo dev não tem acesso ao projeto `llslucas` | medium | Real: `eas init` com projectId existente falha/prompta. Doc fix direto ("apenas 1ª vez") → **patch G2** |
| 5 | blind + edge | `nc` no troubleshooting sem `adb shell`, sem timeout, sem semântica de sucesso | low | Real; correção direta no doc → **patch G2** |
| 6 | verif-gap (pre-verificado) | Nada protege a identidade EAS (package, projectId, permissions, profiles) — regressão em `app.json`/`eas.json` passa em todos os portões | medium | Evidência filed: nenhum teste/lint/tsc parseia esses arquivos; guard no estilo `palette.guard.test.ts` → **patch G1** |
| 7 | blind + verif-gap | Spec Verification aponta `ls databases/` mas banco real fica em `files/SQLite/` | true | Fix edita esta spec → **rejeitado** (regra do workflow); README já tem o caminho certo |
| 8 | blind | Bullet "Pendente (exige o Lucas)" obsoleta vs "Execução real" | true | Fix edita esta spec → **rejeitado** (regra do workflow) |
| 9 | blind | Spec Verification: tsc "0 erros" vs critério baseline aplicado; `eas build` sem `npx` | true | Fix edita esta spec → **rejeitado** (regra do workflow); critério real documentado nas Implementation Notes |
| 10 | blind | Datas "21/09" (UTC do device) vs `created` 20/09 local | low | Cosmético; fix edita spec → **rejeitado** (regra do workflow) |
| 11 | blind | Boundary congelada omite lockfile + artefatos BMAD presentes no diff | true | Bloco congelado é human-owned; reconciliação está nas Implementation Notes; fix edita spec → **rejeitado** |
| 12 | blind + edge | `epic-1-context.md` com status "13/09" stale + frase truncada ("Drift check no guarda o contrato") | low | Fix edita agent-context file → **defer** |
| 13 | blind | Dívida tsc (3 erros pré-existentes) "candidata a story técnica" sem rastreio | low | Real; mecanismo correto é o deferred-work → **defer** |
| 14 | blind + edge | `android.permissions` allowlist poderia derrubar permissão futura (ex.: VIBRATE) | false | A lista espelha exatamente o que os plugins atuais pedem (camera + location); nenhum módulo presente fora dela; incluir novas é o workflow padrão do Expo — nenhum mau outcome demonstrado |
| 15 | edge | AC #7 vs README (conjunto dos itens 1/2/4) | medium | Mesma raiz do G2 → **patch G2** (carried) |

## Design Notes

**Conexão emulador ↔ WSL2:** dev server (8081) e API (3000) rodam no WSL2; o emulador roda no Windows. O `adb` é o do Windows; `adb reverse` faz o `localhost` do emulador alcançar o host, e o port-forwarding de localhost do WSL2 completa o caminho. Sem `adb reverse`, o fallback `10.0.2.2` também resolve — documentar os dois caminhos.

**Câmera:** o emulador aceita a webcam do host como câmera (dispositivo `Webcam0`) — apontar um QR na tela/celular — ou usa a virtual scene. QR de teste: o próprio app renderiza o QR do aluno em `/qr-code` (usuário STUDENT via MSW), ou qualquer gerador com o payload da 3.2b.

**AVD para NFR20:** criar device 5" 720x1280 (~300dpi) no AVD Manager para validar tela pequena — verificação sem custo de código (NFR18–NFR20 são medidos, não entregues, aqui).

**Esqueleto do `eas.json`:**

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

## Verification

**Commands:**
- `cd mobile && npx tsc --noEmit` — expected: 0 erros
- `cd mobile && npm run lint` — expected: limpo
- `cd mobile && npm test` — expected: suíte jest verde
- `cd mobile && eas build -p android --profile development` — expected: build completo + URL do APK
- `adb install <apk>` e `adb reverse --list` — expected: APK instalado; 8081 e 3000 revertidas

**Manual checks:**
- NFR5: `adb shell am force-stop <pkg>` → iniciar o APK `preview` → `adb logcat -d | grep -i displayed`; registrar tempo + confirmação de tela operacional
- MMKV nativo: login → forçar stop → reabrir → sessão preservada (substrato Nitro/mmap, sem `localStorage`)
- SQLite nativo: `offline_queue` no banco nativo (ex.: `adb shell "run-as <pkg> ls databases/"` — build de dev é debuggable)
- QR: câmera do emulador lê QR → fluxo de check-in reage
