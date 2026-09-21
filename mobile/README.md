# PureUrban — App Mobile

App [Expo](https://expo.dev) (SDK 55) do PureUrban, com roteamento por arquivos via
[Expo Router](https://docs.expo.dev/router/introduction) em `src/app/`.

## Ambientes de execução

O projeto tem **dois** ambientes, e nenhum deles é o Expo Go — o app depende de MMKV
(Nitro Modules), que o Expo Go não carrega em versão nenhuma:

| Ambiente | Comando | Para quê |
|---|---|---|
| **Alvo web** (Story 1.6) | `npm run web` | Desenvolvimento e verificação do dia a dia |
| **Development build Android** (Story 1.7) | [seção abaixo](#development-build-android) | Validação nativa: MMKV/SQLite nativos, câmera real, boot (NFR5), NFR18–NFR20 |

As telas do produto são alcançáveis (shell de navegação da Story 1.8). O ponto de
entrada roteia por papel: `DRIVER` cai em `/(driver)/trip`, `STUDENT` em
`/(student)/home`, `ADMIN` em `/(admin)/home`; sem sessão, em `/(auth)/login`. Digitar
uma rota protegida direto na barra de endereços redireciona para o destino do papel
atual — nunca tela em branco.

## Alvo web

### Pré-requisitos

1. Dependências instaladas: `npm install`
2. Banco e Redis no ar, a partir da raiz do repositório: `docker compose up -d`
3. Migrações aplicadas: `cd ../api && npx prisma migrate deploy && npx prisma generate`
4. API no ar: `cd ../api && npm run start:dev`
5. Um usuário para logar. Rode o seed na API — cria a empresa `PureUrban Dev` e o
   admin `admin@pureurban.dev` / `admin123456` (troque a senha após o primeiro login).
   Idempotente: se os dados já existem, imprime `Skipping.` e não altera nada:

   ```bash
   cd ../api && npm run seed
   ```

6. `mobile/.env` criado a partir de `.env.example`:

   ```bash
   cp .env.example .env
   ```

   ⚠️ **`.env.example` traz o valor do alvo web, não o de todos os alvos.** No web,
   `EXPO_PUBLIC_API_URL` precisa apontar para o host do browser
   (`http://localhost:3000`, ou a porta que a API estiver usando). Para o **emulador
   Android**, comente a linha: o fallback `http://10.0.2.2:3000` é o valor correto, e
   `localhost` dentro do emulador aponta para o próprio emulador. Ver os comentários
   do `.env.example` para cada alvo.

   `.env` é lido em todos os modos, produção inclusa. Um valor de host local é
   ignorado em builds de produção (`src/utils/constants.ts`), com erro no console.

### Subir

```bash
npm run web
```

O script fixa `--port 8081` de propósito. A porta faz parte do contrato com a API:
`CORS_ORIGIN` (em `api/.env`, default `http://localhost:8081`) precisa casar com a
origem do dev server. Se você subir noutra porta, o app carrega normalmente e **só o
login falha**, com erro de CORS no console — ajuste `CORS_ORIGIN`, não a URL da API.

### ⚠️ Abra sempre por `http://localhost:8081` — nunca pelo IP de LAN

Duas APIs do caminho crítico só existem em **secure context** (HTTPS ou `localhost`).
`localhost` conta como contexto seguro mesmo em HTTP; `http://192.168.x.x:8081` não:

| API | Onde é usada | O que quebra |
|---|---|---|
| `crypto.randomUUID()` | `expo-crypto` → `auth.store.ts` | O **login** falha |
| `navigator.mediaDevices.getUserMedia` | `expo-camera` web → `QrScanner` | A câmera não abre |
| `crossOriginIsolated` / `SharedArrayBuffer` | wa-sqlite (OPFS) → `initializeDatabase()` | O **Tier 2 inteiro** morre |

O sintoma mais confuso é o primeiro: pelo IP de LAN o login quebra, não só a câmera.
E o terceiro é pior ainda, porque é **silencioso** — `initializeDatabase()` só loga o
erro e o app segue sem fila offline (`src/app/_layout.tsx`), sem nada na tela.

### Mocks (MSW)

> `enableMocking()` é idempotente desde a Story 1.8: a guarda vive em `globalThis`
> (não numa flag de módulo, que o Fast Refresh zeraria), então o segundo
> `server.listen()` nunca acontece e salvar um arquivo com o dev server no ar não
> derruba o app. Uma falha real na inicialização do MSW ainda para o app de propósito
> (design da Story 3.0: melhor parar do que mandar requisições para a API real sem aviso).

`EXPO_PUBLIC_USE_MOCKS=1` no `.env` faz as requisições da API serem atendidas em
memória pelo MSW, sem backend de pé. `.env.example` lista os usuários e os IDs que os
handlers conhecem. Com a flag ligada, o console mostra `[mocks] MSW ativo`. Reinicie o
dev server ao trocar a flag — variáveis `EXPO_PUBLIC_*` entram no bundle em build time.

### Exportar o bundle web

```bash
npx expo export --platform web   # emite ./dist
```

## Limitações do alvo web

O alvo web é ambiente de **desenvolvimento e verificação**, não substituto do device:

| Limitação | Consequência |
|---|---|
| Suporte web do `expo-sqlite` é **alpha** (doc oficial) | O Tier 2 (fila offline) só é validado de verdade no development build da Story 1.7 |
| MMKV vira `localStorage` | Sem criptografia; perfil de performance diferente; cota do browser (~5-10MB) |
| Exige `http://localhost:8081` | IP de LAN quebra **login** (`crypto.randomUUID`) e câmera (`getUserMedia`) |
| `COEP: credentialless` não é suportado no Safari | O alvo é Chrome/Edge/Firefox. Restrição de ambiente de dev, não de produto |
| Câmera é webcam, não câmera de device | Ergonomia de embarque (NFR18–NFR20) não é avaliável aqui. **A webcam nunca foi exercitada** — a AC #7 da Story 1.6 ficou diferida |
| Push (Story 4.4b), GPS em background e Tier 2 real | Exigem a Story 1.7 (Architecture §8, regra 15) |
| Servir `dist/` estático | Precisa dos mesmos headers COOP/COEP **e** de rewrite catch-all — ver abaixo |

### Servir `dist/` como estático

O `metro.config.js` injeta `Cross-Origin-Opener-Policy: same-origin` e
`Cross-Origin-Embedder-Policy: credentialless` — **só no dev server**. Sem cross-origin
isolation não existe `SharedArrayBuffer`, e sem ele o wa-sqlite (o `expo-sqlite` do
web) não abre o banco. Qualquer servidor estático que sirva `dist/` precisa emitir os
**mesmos dois headers**, senão o app carrega mas o Tier 2 morre.

Além dos headers, o servidor precisa de **rewrite catch-all para `/index.html`**.
`app.json` usa `web.output: "single"` — é um SPA com um único HTML, não mais um
arquivo por rota. Sem o rewrite, acesso direto ou F5 em `/scan`, `/qr-code` ou
`/login` devolve 404.

## Development build Android

O APK nativo é gerado na **nuvem EAS** (`eas-cli` faz o build, nada compila na sua
máquina — sem Android SDK/JDK local). Existem dois profiles, ambos `buildType: "apk"`
e `distribution: "internal"` (instalável direto no emulador, sem loja e sem AAB):

| Profile | `eas.json` | Para quê |
|---|---|---|
| `development` | `developmentClient: true` | Dia a dia: o app é um shell que carrega o bundle do Metro (`expo-dev-client`) |
| `preview` | sem dev client | APK release de verdade — é o único que mede boot real (NFR5), pois o build de dev baixa o bundle do Metro |

Expo Go **não é alvo** em nenhum passo: MMKV (Nitro Modules) não roda nele.

### Pré-requisitos

1. Conta Expo gratuita (o projeto usa `android.package` `com.pureurban.mobile`).
2. `eas-cli` — já é devDependency do projeto; use `npx eas ...` dentro de `mobile/`
   (não precisa de instalação global).
3. Emulador no **Windows** (o dev server e a API rodam no WSL2, o emulador não):
   `adb.exe` do Android SDK no PATH do Windows, e um AVD. Para validar tela pequena
   (NFR20), crie no AVD Manager um device de **5" 720x1280 (~300dpi)**.
4. API no ar (`cd ../api && npm run start:dev` com `docker compose up -d` na raiz) e
   `mobile/.env` criado a partir de `.env.example` (para o emulador, a linha
   `EXPO_PUBLIC_API_URL` fica **comentada** — ver nota de `adb reverse` abaixo).

### Build (uma vez, ou quando a config nativa mudar)

```bash
npx eas login          # conta Expo (só uma vez por máquina)
npx eas init           # SÓ NA PRIMEIRA VEZ — veja abaixo antes de rodar
npx eas build -p android --profile development   # APK de validação (dev client)
npx eas build -p android --profile preview       # APK release p/ medição de boot (NFR5)
```

O `eas init` cria o projeto EAS e grava `extra.eas.projectId` em `app.json` — commitado
uma vez e mantido estável. **Se o seu `app.json` já tem `extra.eas.projectId`, pule o
`eas init`**: o projeto já existe (é do dono, o `owner` em `app.json`) e rodar de novo
criaria um projeto paralelo que você não tem acesso. Para um segundo desenvolvedor
buildar o projeto do dono, o dono precisa convidá-lo como colaborador no dashboard EAS
(expo.dev → projeto → Access) com a conta usada no `eas login`.

O build imprime a URL do artefato. Baixe o `.apk` e instale no emulador:

```bash
adb install pureurban-<profile>.apk
```

### Rodar conectado ao dev server

O emulador roda no Windows; o Metro (8081) e a API (3000) rodam no WSL2. O `adb` é o
do Windows e o `adb reverse` faz o `localhost` do emulador alcançar o host — o
port-forwarding de localhost do WSL2 completa o caminho:

```bash
adb reverse tcp:8081 tcp:8081   # Metro (obrigatório p/ o dev client carregar o bundle)
adb reverse tcp:3000 tcp:3000   # API (alternativa ao fallback 10.0.2.2)
adb reverse --list              # deve listar 8081 e 3000
```

```bash
npx expo start --dev-client     # dentro de mobile/
```

Abra o app no emulador — ele lista o dev server, carrega o bundle e cai na tela de
login contra a API local. **Sem `adb reverse`**, o caminho alternativo da API é o
fallback `http://10.0.2.2:3000` (`src/utils/constants.ts`, com
`EXPO_PUBLIC_API_URL` comentada no `.env`): `10.0.2.2` é o alias do host dentro do
emulador. O Metro, esse sim, precisa do reverse (ou do IP de LAN do dev server).

### Verificação nativa (roteiro manual)

- **MMKV nativo (Nitro/mmap):** logue, force o stop do processo
  (`adb shell am force-stop com.pureurban.mobile`), reabra — a sessão tem que estar
  preservada, sem `localStorage` envolvido.
- **SQLite nativo:** o banco `pureurban.db` existe no armazenamento do app (build de
  dev é debuggable, então `run-as` funciona):
  `adb shell "run-as com.pureurban.mobile ls files/SQLite/"` — e a fila
  `offline_queue` responde às migrações.
- **QR pela câmera do emulador:** o emulador aceita a webcam do host como câmera
  (dispositivo `Webcam0` nas configurações do AVD — aponte um QR na tela) ou usa a
  virtual scene. QR de teste: o próprio app renderiza o QR do aluno em `/qr-code`
  (usuário STUDENT, via MSW), ou qualquer gerador com o payload da Story 3.2b.
  Em `/scan` (DRIVER), a leitura dispara o fluxo de check-in.
- **Ergonomia de device (NFR18–NFR20):** abra o AVD de 5" 720x1280 dos pré-requisitos
  e percorra as telas principais com uma mão, avaliando alcance do polegar nos botões
  primários, tamanho dos alvos de toque e contraste. São NFRs **medidos, não
  entregues, aqui** — achados viram insumo das stories de feature, não bloqueio.
- **Boot real (NFR5, alvo < 3s):** use o APK `preview` — build de dev baixa o bundle
  do Metro e **não** mede boot. `adb shell am force-stop com.pureurban.mobile`, inicie
  o app frio, confirme que a tela está operacional, então:
  `adb logcat -d | grep -i displayed`. Registre **método + número** — mesmo que o
  emulador não cumpra os 3s, o registro vira achado, não falha da story.

### Troubleshooting — "conexão com a API caiu"

As regras de `adb reverse` **não sobrevivem** a um restart do servidor adb nem a uma
reconexão do transporte do emulador (sintomas: request com `Connection refused` /
"Network request failed" no app, às vezes voltando a funcionar sozinho). Recrie as duas
regras e tente de novo — vale colar no PowerShell do Windows, onde roda o `adb` que o
emulador enxerga. A porta da API tem que casar com o `PORT` do `api/.env` — default
**3000** (o 3001 visto antes aqui era só o setup desta máquina). Se o seu `PORT` for
outro, ajuste as duas regras e os `nc` abaixo:

```powershell
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe reverse tcp:3000 tcp:3000
```

Teste rápido de cada elo, de dentro do emulador — o `nc` roda no Android, não no
Windows (`-w 2` desiste após 2s; a porta tem que casar com `PORT` da API / 8081 do
Metro):

```powershell
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe shell "nc -w 2 localhost 8081"   # Metro
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe shell "nc -w 2 localhost 3000"   # API
```

**Silêncio é sucesso** (o `nc` fica aguardando dados — `Ctrl+C` para sair);
`Connection refused` significa que a regra do reverse morreu — recrie-a. Se o Metro
responder e a API não, quase sempre é a regra da porta da API que morreu.

### Limitações

| Limitação | Consequência |
|---|---|
| Build na nuvem EAS | Consome os créditos do plano gratuito; requer `eas login` |
| `extra.eas.projectId` em `app.json` | Identidade do projeto EAS — comitada uma vez e mantida estável |
| Nada de iOS | Sem conta Apple, sem macOS, sem signing iOS |
| Nada de loja | Sem Play Console, sem AAB, sem CI — APK `internal` distribution only |

## Convenções

- Imports internos usam o alias `@/*` → `./src/*`
- Arquivos em kebab-case, indentação de 2 espaços
- `npm run lint` — ESLint (flat config, `eslint-config-expo`)
- `npx tsc --noEmit` — checagem de tipos
- `npm test` / `npm run test:watch` — Jest via `jest-expo`; arquivos `src/**/*.{test,spec}.{ts,tsx}`, sem device/rede/`.env`
- `npm run openapi:types` — regenera `src/types/api.d.ts` a partir de `../api/openapi.json`
- **Nunca commite `.env`** — use `.env.example` como referência
