# PureUrban — App Mobile

App [Expo](https://expo.dev) (SDK 55) do PureUrban, com roteamento por arquivos via
[Expo Router](https://docs.expo.dev/router/introduction) em `src/app/`.

## Ambientes de execução

O projeto tem **dois** ambientes, e nenhum deles é o Expo Go — o app depende de MMKV
(Nitro Modules), que o Expo Go não carrega em versão nenhuma:

| Ambiente | Comando | Para quê |
|---|---|---|
| **Alvo web** (Story 1.6) | `npm run web` | Desenvolvimento e verificação do dia a dia |
| **Development build Android** (Story 1.7) | ver a Story 1.7 | Validação nativa: push, GPS em background, Tier 2 real |

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
5. Um usuário para logar. **O seed não funciona** — `npm run seed` não existe,
   `npx prisma db seed` responde `No seed command configured` (o Prisma 7 moveu essa
   chave para `prisma.config.ts` e ela não foi migrada) e `prisma/seed.ts` falha em
   `new PrismaClient()` sem `adapter`. Crie o admin pela própria API:

   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"name":"PureUrban Dev","email":"admin@pureurban.dev","password":"admin123456"}'
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

## Convenções

- Imports internos usam o alias `@/*` → `./src/*`
- Arquivos em kebab-case, indentação de 2 espaços
- `npm run lint` — ESLint (flat config, `eslint-config-expo`)
- `npx tsc --noEmit` — checagem de tipos
- `npm run openapi:types` — regenera `src/types/api.d.ts` a partir de `../api/openapi.json`
- **Nunca commite `.env`** — use `.env.example` como referência
