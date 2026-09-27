# PureUrban Mobile — antes e depois do redesign (Épico 6)

Capturas "antes" em [`audit/`](audit/) (auditoria de 26/09/2026, ver `EXPERIENCE.md` → Auditoria da
UI atual) e "depois" em [`after/`](after/) (Story 6.12, 27/09/2026). Mesmos nomes de arquivo, mesmo
usuário mock, mesma tela, mesma ação e mesmo esquema de cor do SO. Ambiente: Expo Web + MSW
(`EXPO_PUBLIC_USE_MOCKS=1`, `EXPO_PUBLIC_E2E=1` para injetar a leitura do QR), Chromium do
Playwright, viewport 390×844 @2x (PNG 780×1688), `pt-BR`, fuso `America/Sao_Paulo`.

Os usuários mock são `<usuário>@pureurban.com` com senha `senha123`
(`mobile/src/mocks/handlers/auth.handlers.ts`).

## Como regenerar

```bash
# terminal 1 — dentro de mobile/ (não edite o .env: as variáveis vão pela linha de comando)
EXPO_PUBLIC_USE_MOCKS=1 EXPO_PUBLIC_E2E=1 npx expo start --web --port 8081

# terminal 2 — na raiz do repositório
node mobile/scripts/capture-demo-screens.mjs            # as 27
node mobile/scripts/capture-demo-screens.mjs light-14   # filtro por trecho do nome
```

O script usa o Playwright de `api/node_modules`, abre um contexto novo por captura (o MSW guarda
estado em memória) e falha por captura, com a mensagem, sem gravar PNG vazio. Derrube o Metro antes
de rodar Jest ou `tsc` (ver o gate na `plan-6-12`).

## Diferenças de estado conhecidas

- **Mesmo dado, número diferente nas telas do motorista.** O mock contava o aluno que "não vai
  voltar" no total do roster (0/4); a API real o exclui (`get-trip-students.use-case`). O mock foi
  corrigido na 6.12, então o "depois" mostra 0/3 onde o "antes" mostrava 0/4 — a legenda da lista
  agora fecha a soma (0 + 1 + 3 = 4 alunos).
- **Estados que o mock não alcança, iguais no antes e no depois:** `light-32` (o mock não tem
  handler de rastreamento, a tela cai no erro), `light-34` (o mock não tem o
  `POST /boarding/not-returning`, então a ausência falha com Snackbar) e `light-19` (depois de
  encerrar, o mock serve uma nova viagem ativa ao motorista padrão). Os estados reais — ETA ao vivo,
  "Motorista avisado" com contagem regressiva, ida concluída → "Iniciar Retorno" — estão cobertos
  pelos specs `pw:e2e` contra a API real (ver `plan-6-12`).
- **`light-16`:** a segunda injeção do mesmo QR é descartada pelo scanner (mesma string lida duas
  vezes), então a tela volta ao estado ocioso, como no "antes". O "Já embarcou" âmbar só aparece
  com uma leitura nova do mesmo aluno.
- **`light-10` = `light-11` e `dark-*` = `light-*`:** a sentinela `motorista-viagem-encerrada`
  serve de propósito uma viagem ATIVA (o 409 só aparece ao escanear), e o app está travado no tema
  claro (D-UX-4). Os PNGs saem idênticos byte a byte, o que comprova a trava.
- **A câmera é a falsa do Chromium** (`--use-fake-device-for-media-stream`): o fundo verde com o
  "pac-man" no scan é o feed de teste, não a UI.

## Tabela lado a lado

| # | Estado | Usuário mock | Antes | Depois | Nota |
|---|---|---|---|---|---|
| light-01 | Login vazio | — | <img src="audit/light-01-login.png" width="180"> | <img src="after/light-01-login.png" width="180"> | Hero amarelo com marca (D-UX-1), fonte Inter (D-UX-2). |
| light-02 | Login enviado vazio | — | <img src="audit/light-02-login-erro-vazio.png" width="180"> | <img src="after/light-02-login-erro-vazio.png" width="180"> | Erro virou Banner inline acima do botão. |
| light-10 | Viagem com a sentinela de viagem encerrada | `motorista-viagem-encerrada` | <img src="audit/light-10-trip-encerrada-sentinela.png" width="180"> | <img src="after/light-10-trip-encerrada-sentinela.png" width="180"> | Igual a `light-11` (sentinela serve viagem ativa). Total 0/3 (mock corrigido). |
| dark-01 | Login vazio, SO em escuro | — | <img src="audit/dark-01-login.png" width="180"> | <img src="after/dark-01-login.png" width="180"> | Idêntico a `light-01` (trava de tema claro). |
| dark-02 | Login enviado vazio, SO em escuro | — | <img src="audit/dark-02-login-erro-vazio.png" width="180"> | <img src="after/dark-02-login-erro-vazio.png" width="180"> | Idêntico a `light-02`. |
| dark-10 | Sentinela de viagem encerrada, SO em escuro | `motorista-viagem-encerrada` | <img src="audit/dark-10-trip-encerrada-sentinela.png" width="180"> | <img src="after/dark-10-trip-encerrada-sentinela.png" width="180"> | Idêntico a `light-10`. |
| light-11 | Viagem de ida ativa | `motorista` | <img src="audit/light-11-trip-ativa.png" width="180"> | <img src="after/light-11-trip-ativa.png" width="180"> | TripCard com contador herói; ações no rodapé. Nome da rota cai no fallback "Rota atribuída" (decisão congelada da 6.5: em cold start com viagem ativa, `/routes/mine` não é chamado). |
| light-12 | Lista de alunos | `motorista` | <img src="audit/light-12-student-list.png" width="180"> | <img src="after/light-12-student-list.png" width="180"> | Cabeçalho fixo com contador e legenda; avatar de iniciais; chips com ícone. |
| light-13 | Scan ocioso | `motorista` | <img src="audit/light-13-scan-idle.png" width="180"> | <img src="after/light-13-scan-idle.png" width="180"> | HUD X/Y da viagem + sessão (D-UX-8); dica e linha de varredura. |
| light-14 | Scan com sucesso (Ana) | `motorista` | <img src="audit/light-14-scan-sucesso.png" width="180"> | <img src="after/light-14-scan-sucesso.png" width="180"> | Nome do aluno no overlay e barra regressiva no topo. |
| light-15 | QR inválido | `motorista` | <img src="audit/light-15-scan-qr-invalido.png" width="180"> | <img src="after/light-15-scan-qr-invalido.png" width="180"> | Ícone desenhado em vez de caractere; tipo grande. |
| light-16 | Mesmo QR lido de novo | `motorista` | <img src="audit/light-16-scan-segundo-mesmo-aluno.png" width="180"> | <img src="after/light-16-scan-segundo-mesmo-aluno.png" width="180"> | Leitura repetida descartada: ocioso, como no antes. HUD mostra 1/3. |
| light-17 | Lista após o check-in | `motorista` | <img src="audit/light-17-student-list-apos-checkin.png" width="180"> | <img src="after/light-17-student-list-apos-checkin.png" width="180"> | Barra de progresso preenchida; hora do embarque na linha. |
| light-18 | Minhas rotas (sem entrada no app) | `motorista` | <img src="audit/light-18-routes.png" width="180"> | <img src="after/light-18-routes.png" width="180"> | Restyle da 6.13: RouteCard com nome sem glifo, "Centro → Campus Universitário" com ícone e descrição sem itálico; sem rótulos em CAIXA-ALTA. Continua sem entrada no app (D-UX-6 recusada). |
| light-19 | Ida encerrada pelo ConfirmDialog | `motorista` | <img src="audit/light-19-trip-encerrada-ida.png" width="180"> | <img src="after/light-19-trip-encerrada-ida.png" width="180"> | O encerramento agora passa pelo ConfirmDialog (D-UX-7); o mock devolve outra viagem ativa, como no antes. |
| light-20 | Viagem com turma vazia | `motorista-turma-vazia` | <img src="audit/light-20-trip-turma-vazia.png" width="180"> | <img src="after/light-20-trip-turma-vazia.png" width="180"> | Contador oculto, "Nenhum aluno nesta rota". |
| light-21 | Lista vazia | `motorista-turma-vazia` | <img src="audit/light-21-student-list-vazia.png" width="180"> | <img src="after/light-21-student-list-vazia.png" width="180"> | StateView vazio. O cabeçalho ainda mostra "0/0" (desvio aceito na 6.7; o `EXPERIENCE.md` pedia o contador oculto). |
| light-22 | Lista com 60 alunos | `motorista-turma-grande` | <img src="audit/light-22-student-list-60.png" width="180"> | <img src="after/light-22-student-list-60.png" width="180"> | Avatares "A0"/"A1" vêm dos nomes mock "Aluno Teste 01" (iniciais de palavra numérica). |
| light-23 | Motorista sem viagem | `motorista-sem-viagem` | <img src="audit/light-23-trip-sem-viagem.png" width="180"> | <img src="after/light-23-trip-sem-viagem.png" width="180"> | StateView com o nome da rota e "Iniciar Viagem" no rodapé. |
| light-24 | Scan sem viagem ativa | `motorista-sem-viagem` | <img src="audit/light-24-scan-sem-viagem.png" width="180"> | <img src="after/light-24-scan-sem-viagem.png" width="180"> | StateView bloqueado com "Ir para Viagem". Rota alcançada pela History API (sem botão de scan sem viagem). |
| light-30 | Início do aluno | `aluno` | <img src="audit/light-30-student-home.png" width="180"> | <img src="after/light-30-student-home.png" width="180"> | Painel do dia: cartão de status, atalhos 2×1, "Não vou voltar" no rodapé. |
| light-31 | Meu QR Code | `aluno` | <img src="audit/light-31-qr-code.png" width="180"> | <img src="after/light-31-qr-code.png" width="180"> | QrPass com faixa amarela, nome e rota. |
| light-32 | Acompanhar ônibus | `aluno` | <img src="audit/light-32-track-bus.png" width="180"> | <img src="after/light-32-track-bus.png" width="180"> | Erro no mock nos dois (sem handler de rastreamento); agora via StateView com "Tentar novamente". |
| light-33 | Dialog "Não vou voltar" | `aluno` | <img src="audit/light-33-dialog-nao-vou-voltar.png" width="180"> | <img src="after/light-33-dialog-nao-vou-voltar.png" width="180"> | "Avisar motorista" contido e "Voltar" discreto. |
| light-34 | Após confirmar a ausência | `aluno` | <img src="audit/light-34-ausencia-registrada.png" width="180"> | <img src="after/light-34-ausencia-registrada.png" width="180"> | Falha no mock nos dois (sem o endpoint de ausência): Snackbar de erro. |
| light-35 | QR de aluno sem rota | `aluno-sem-rota` | <img src="audit/light-35-qr-sem-rota.png" width="180"> | <img src="after/light-35-qr-sem-rota.png" width="180"> | "Nenhuma rota vinculada" como linha discreta na faixa. |
| light-40 | Painel admin | `admin` | <img src="audit/light-40-admin.png" width="180"> | <img src="after/light-40-admin.png" width="180"> | Faixa de marca com o wordmark e StateView "Em breve" com "Sair" (6.13). O "antes" foi capturado na 6.13, antes do redesign — o admin não tinha usuário mock na auditoria. |
