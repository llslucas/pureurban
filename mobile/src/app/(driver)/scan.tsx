import * as Crypto from 'expo-crypto'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'
import { useCameraPermissions } from 'expo-camera'

import { QrScanner } from '@/components/qr-scanner'
import { notifyQueueChanged } from '@/hooks/use-offline-sync'
import { sqliteQueueStorage } from '@/lib/offline-queue-storage'
import { boardingService } from '@/services/boarding.service'
import { ApiClientError } from '@/services/api-client'
import { activeTripOptions, tripStudentsKey } from '@/lib/trip-queries'
import { useAuthStore } from '@/stores/auth.store'
import { enqueueCheckIn, isTransportFailure } from '@/utils/offline-queue'
import { decodeQrPayload } from '@/utils/qr-payload'
import { registerE2eScanHook } from '@/utils/e2e-scan-hook'
import {
  describeFailure,
  feedbackIcon,
  QUEUE_FULL_FEEDBACK,
  QUEUED_FEEDBACK,
  type Tone,
} from '@/utils/scan-feedback'

// Quanto tempo o resultado de SUCESSO fica na tela antes de a câmera voltar
// sozinha. Só o sucesso auto-retoma: nos estados de erro o motorista precisa ler
// o que aconteceu antes de continuar.
const SUCCESS_RESUME_MS = 2500

// Union discriminado em vez de booleanos soltos (architecture.md §6). Com
// booleanos, `isChecking && isError` é representável e significa nada.
type ScanResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'success'; title: string; detail: string }
  | {
      kind: 'failure'
      // Campos de `ScanFeedback` (`@/utils/scan-feedback`), achatados no union
      // para o render discriminar por `kind` sem desembrulhar um nível a mais.
      code: string
      tone: Tone
      title: string
      detail: string
      canRetry: boolean
    }

// A última tentativa, guardada para o botão "Tentar novamente" reenviar com a
// MESMA chave de idempotência. Chave nova para o mesmo aluno faria o servidor
// tratar o reenvio como operação distinta e responder DUPLICATE_CHECK_IN — que
// é exatamente o que a idempotência existe para evitar.
interface Attempt {
  studentId: string
  tripId: string
  idempotencyKey: string
  /**
   * ISO 8601 do ESCANEAMENTO. Vira `created_at` na `offline_queue` e viaja como
   * `occurredAt` no dreno — sem ele o embarque registraria a hora em que a rede
   * voltou, e não a hora em que o aluno subiu no ônibus (NFR12).
   */
  scannedAt: string
}

const TONE_COLOR: Record<Tone, string> = {
  // Verde/âmbar/vermelho/cinza-escuro sobre o preto da câmera — contraste alto,
  // legível em movimento e sob sol direto (NFR18).
  success: '#1B7F3B',
  warn: '#B26A00',
  error: '#B3261E',
  offline: '#37474F',
}

export default function ScanScreen() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  // Gate de foco do Bloqueador 2 da Story 3.5b: navegar scan → student-list
  // EMPILHA uma tela; sem desmontar o <QrScanner>, o CameraView segura o
  // hardware e drena bateria a viagem inteira. `isPaused` não fecha a câmera —
  // só não renderizar o componente fecha.
  const isFocused = useIsFocused()
  const [permission, requestPermission, getPermission] = useCameraPermissions()
  const [result, setResult] = useState<ScanResult>({ kind: 'idle' })
  const [boardedCount, setBoardedCount] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)
  // Falha ao abrir o pedido de permissão ou as configurações do sistema. Antes
  // as duas promises eram descartadas com `void`: a rejeição ficava sem
  // tratamento e o botão simplesmente parecia morto.
  const [actionError, setActionError] = useState<string | null>(null)
  const lastAttempt = useRef<Attempt | null>(null)
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Segunda metade do gate do Bloqueador 3. O `isPaused` passado ao QrScanner é
  // derivado de `result`, e `setResult` só tem efeito na PRÓXIMA renderização —
  // entre a primeira leitura e esse render, a câmera continua entregando frames
  // e `handleScan` seria chamado de novo. Este ref fecha na mesma instrução.
  const isBusy = useRef(false)
  // Aluno do último check-in bem-sucedido. A auto-retomada do estado 7 devolve a
  // câmera a `idle` com o QR do aluno provavelmente ainda enquadrado; reler ali
  // geraria chave NOVA e o servidor responderia 409 DUPLICATE_CHECK_IN, pintando
  // de âmbar um embarque que acabou de dar certo. Só é limpo quando OUTRO QR
  // aparece — é o gate do Bloqueador 3 aplicado à porta da auto-retomada.
  const lastSuccessStudentId = useRef<string | null>(null)
  // Um check-in em voo por vez. `handleScan` já é protegido por `isBusy`, mas
  // "Tentar novamente" não era: dois toques no mesmo lote de render disparavam
  // dois POSTs, o segundo voltava como replay 201 e o contador somava o mesmo
  // aluno duas vezes — além de sobrescrever `resumeTimer.current` e deixar o
  // `setTimeout` anterior órfão, sobrevivendo ao `clearTimeout` do `resume()`.
  const isSubmitting = useRef(false)

  const {
    data: activeTrip,
    status: tripStatus,
    refetch: refetchTrip,
  } = useQuery(activeTripOptions())

  // O estado 2 manda o motorista às configurações do sistema, mas
  // `useCameraPermissions` não reavalia sozinho quando o app volta ao primeiro
  // plano: sem isto, quem concede a permissão lá fora e retorna continua vendo
  // "Câmera bloqueada" — a afordância que a tabela prescreve terminaria em beco
  // sem saída.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermission()
    })
    return () => subscription.remove()
  }, [getPermission])

  // Sair da tela com o timer vivo faria `setState` em componente desmontado.
  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current)
    }
  }, [])

  const resume = useCallback(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current)
      resumeTimer.current = null
    }
    lastAttempt.current = null
    isBusy.current = false
    setResult({ kind: 'idle' })
  }, [])

  // Task 5.5 da Story 3.5b: ao voltar o foco (retorno da lista de alunos), a
  // câmera reabre pronta para ler, nunca congelada num overlay de resultado
  // antigo. Sem isto, voltar da lista deixa a tela travada no último resultado.
  useFocusEffect(
    useCallback(() => {
      resume()
    }, [resume]),
  )

  // Persiste o embarque na `offline_queue` e devolve o feedback a exibir. O `id`
  // do item É a `X-Idempotency-Key` da tentativa, então o dreno reenvia como
  // replay e o servidor nunca vê uma operação nova.
  const enqueue = useCallback(async (attempt: Attempt, transportError: unknown) => {
    try {
      const outcome = await enqueueCheckIn(sqliteQueueStorage, {
        id: attempt.idempotencyKey,
        studentId: attempt.studentId,
        tripId: attempt.tripId,
        scannedAt: attempt.scannedAt,
      })
      if (outcome.kind === 'full') return QUEUE_FULL_FEEDBACK
      // Acorda o dreno, que vive no layout do grupo: sem isto o banner só
      // apareceria no próximo tick do backoff.
      notifyQueueChanged()
      return QUEUED_FEEDBACK
    } catch (error: unknown) {
      // O banco local não abriu (OPFS sem `crossOriginIsolated`, disco cheio).
      // Cair no feedback de rede da 3.3b devolve ao motorista a única
      // afordância que sobrou — reenviar à mão com a MESMA chave — em vez de
      // mentir que o embarque foi salvo.
      console.error('[offline-queue] falha ao enfileirar o check-in:', error)
      return describeFailure(transportError)
    }
  }, [])

  const submit = useCallback(async (attempt: Attempt) => {
    if (isSubmitting.current) return
    isSubmitting.current = true
    // `checking` é definido pelo chamador ANTES do await — ver `handleScan`.
    try {
      await boardingService.checkIn(
        { studentId: attempt.studentId, tripId: attempt.tripId },
        attempt.idempotencyKey,
      )
      lastSuccessStudentId.current = attempt.studentId
      // AC #4 da Story 3.5b: a lista de alunos reflete este embarque sem o
      // motorista recarregar a tela. Invalidação, não `setQueryData` otimista —
      // `summary` é agregado do servidor (AC #2). `void`: a tela de scan não
      // aguarda o roster; a rede trabalha enquanto o overlay de sucesso aparece.
      void queryClient.invalidateQueries({ queryKey: tripStudentsKey(attempt.tripId) })
      setBoardedCount((n) => n + 1)
      setResult({
        kind: 'success',
        title: 'Embarque confirmado',
        detail: 'Aluno registrado nesta viagem.',
      })
      resumeTimer.current = setTimeout(() => {
        resumeTimer.current = null
        lastAttempt.current = null
        isBusy.current = false
        setResult({ kind: 'idle' })
      }, SUCCESS_RESUME_MS)
    } catch (error: unknown) {
      // Estado 17 da Tabela de Verdade: "Nada". Quando o refresh falha, o
      // `api-client` já chamou `logout()` e `router.replace('/(auth)/login')`
      // ANTES de lançar — pintar overlay aqui desenharia um erro vermelho com
      // botão de "Tentar novamente" sobre uma tela que está desmontando, e o
      // retry só poderia falhar de novo.
      if (error instanceof ApiClientError && error.code === 'UNAUTHORIZED') {
        return
      }

      // O discriminante da 3.4b: SÓ falha de transporte vai para a fila. Um
      // `status >= 400` é resposta determinística do servidor — enfileirá-la
      // gastaria 5 tentativas para reproduzir o mesmo erro e esconderia do
      // motorista um feedback que ele precisa ver agora.
      if (isTransportFailure(error)) {
        const described = await enqueue(attempt, error)
        if (described.code === QUEUED_FEEDBACK.code) {
          // O embarque foi aceito localmente: trata como sucesso para a câmera.
          // Sem marcar `lastSuccessStudentId`, a auto-retomada devolveria a
          // câmera ao mesmo QR ainda enquadrado e o segundo enfileiramento
          // nasceria com chave NOVA — duas linhas na fila, e um
          // DUPLICATE_CHECK_IN garantido no dreno.
          lastSuccessStudentId.current = attempt.studentId
          setBoardedCount((n) => n + 1)
          setResult({ kind: 'failure', ...described })
          resumeTimer.current = setTimeout(() => {
            resumeTimer.current = null
            lastAttempt.current = null
            isBusy.current = false
            setResult({ kind: 'idle' })
          }, SUCCESS_RESUME_MS)
          return
        }
        setResult({ kind: 'failure', ...described })
        return
      }

      const described = describeFailure(error)
      setResult({ kind: 'failure', ...described })
    } finally {
      isSubmitting.current = false
    }
  }, [enqueue, queryClient])

  const handleScan = useCallback(
    (raw: string) => {
      // Fecha o gate SÍNCRONO antes de qualquer outra coisa — ver `isBusy`.
      if (isBusy.current) return
      isBusy.current = true

      // Pausa e feedback ANTES de qualquer await: é este passo, e não a resposta
      // da API, que atende a AC #4 (retorno visual em menos de 2s na percepção
      // do usuário).
      setResult({ kind: 'checking' })

      const payload = decodeQrPayload(raw)
      if (!payload) {
        // Estado 10 da Tabela de Verdade: o QR não é do PureUrban (cartaz, URL,
        // Wi-Fi) ou está malformado. Rejeitado localmente, SEM tocar a rede — o
        // contrato é explícito em que o QR bruto nunca trafega.
        setResult({
          kind: 'failure',
          code: 'INVALID_QR_CODE',
          tone: 'error',
          title: 'QR code inválido',
          detail: 'Este código não é um QR code de aluno do PureUrban.',
          canRetry: false,
        })
        return
      }

      // Releitura do aluno que acabou de embarcar: ignora em silêncio, sem
      // overlay e sem tocar a rede, até que outro QR entre no enquadramento.
      if (payload.studentId === lastSuccessStudentId.current) {
        isBusy.current = false
        setResult({ kind: 'idle' })
        return
      }
      lastSuccessStudentId.current = null

      // Invariante, não estado da tabela: o caminho de render devolve `Blocked`
      // (estado 4) antes de o `QrScanner` montar, então aqui `activeTrip` é
      // sempre ACTIVE. A guarda existe para estreitar o tipo — antes ela
      // carregava uma segunda cópia do texto do estado 12, que nenhum teste ou
      // roteiro manual conseguia exercitar e que ia divergir da primeira.
      if (!activeTrip || activeTrip.status !== 'ACTIVE') {
        isBusy.current = false
        setResult({ kind: 'idle' })
        return
      }

      const attempt: Attempt = {
        studentId: payload.studentId,
        tripId: activeTrip.id,
        // Uma chave por tentativa (Architecture §5, Tier 2). O retry reusa esta
        // mesma chave; QR novo gera chave nova. Sem rede, esta MESMA chave vira
        // a primary key da `offline_queue`.
        idempotencyKey: Crypto.randomUUID(),
        // Carimbado agora, e não no momento da falha nem do dreno.
        scannedAt: new Date().toISOString(),
      }
      lastAttempt.current = attempt
      void submit(attempt)
    },
    [activeTrip, submit],
  )

  // Ref para o `handleScan` corrente: o backdoor de scan do E2E (abaixo) lê
  // sempre a última versão sem se re-registrar a cada render.
  const handleScanRef = useRef(handleScan)
  useEffect(() => {
    handleScanRef.current = handleScan
  })

  // Backdoor SÓ-TESTE do E2E do Épico 3 (Story 3.6). Registra
  // `globalThis.__E2E_INJECT_SCAN__` sob `__DEV__ && EXPO_PUBLIC_E2E === '1'`;
  // no-op fora de teste. Lógica e testes em `@/utils/e2e-scan-hook`.
  useEffect(() => registerE2eScanHook(() => handleScanRef.current), [])

  const handleRetry = useCallback(() => {
    const attempt = lastAttempt.current
    if (!attempt) return
    setResult({ kind: 'checking' })
    void submit(attempt)
  }, [submit])

  // ---- Estados que não mostram a câmera ----

  // Guarda de role: um aluno que chegue nesta rota não pode escanear ninguém.
  if (!user || user.role !== 'DRIVER') {
    return (
      <Blocked
        title="Acesso restrito"
        detail="Apenas motoristas podem registrar embarques."
        actionLabel="Entrar novamente"
        onAction={() => {
          // `logout()` ANTES do replace, como em `(student)/qr-code.tsx`
          // (Task 7.11). Só navegar deixaria `isAuthenticated` true: o aluno
          // ficaria estacionado num formulário de login com a sessão viva, e o
          // shell continuaria montado atrás.
          logout()
          router.replace('/(auth)/login')
        }}
      />
    )
  }

  // Estados 1 e 2 da Tabela de Verdade.
  if (!permission) {
    // O hook ainda não resolveu o estado da permissão.
    return <Loading label="Preparando câmera..." />
  }

  if (!permission.granted) {
    return permission.canAskAgain ? (
      <Blocked
        title="Permissão da câmera"
        detail="O PureUrban precisa da câmera para ler o QR code dos alunos."
        actionLabel="Permitir acesso à câmera"
        note={actionError}
        onAction={() => {
          setActionError(null)
          requestPermission().catch(() =>
            setActionError(
              'Não foi possível pedir a permissão. Libere a câmera nas configurações do sistema.',
            ),
          )
        }}
      />
    ) : (
      <Blocked
        title="Câmera bloqueada"
        detail="A permissão foi negada. Libere o acesso à câmera nas configurações do sistema."
        actionLabel="Abrir configurações"
        note={actionError}
        onAction={() => {
          setActionError(null)
          Linking.openSettings().catch(() =>
            setActionError(
              'Não foi possível abrir as configurações. Abra manualmente e libere a câmera para o PureUrban.',
            ),
          )
        }}
      />
    )
  }

  // Estado 3: `status === 'pending'` e não `isLoading` — com a query pausada
  // (offline) `isLoading` é false e a tela afirmaria "sem viagem ativa" sem
  // nunca ter buscado. Finding literal do review da 3.2b.
  if (tripStatus === 'pending') {
    return <Loading label="Carregando viagem..." />
  }

  // Erro NÃO é vazio — sem esta guarda a query que terminou em `error` cai no
  // estado 4 e a tela afirma "Nenhuma viagem ativa" sem nunca ter conseguido
  // buscar (finding (b) da 3.2b, ação #4 da retro do Épico 2). Com o
  // `networkMode: 'always'` global, erro COM viagem em cache (refetch offline
  // no meio da sessão) não bloqueia: o scan segue do cache e os check-ins
  // enfileiram offline. Só erro sem dado nenhum é tela de bloqueio.
  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <Blocked
        title="Não foi possível carregar a viagem"
        detail="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => void refetchTrip()}
      />
    )
  }

  // Estado 4.
  if (!activeTrip || activeTrip.status !== 'ACTIVE') {
    return (
      <Blocked
        title="Nenhuma viagem ativa"
        detail="Inicie uma viagem para começar a registrar embarques."
        actionLabel="Ir para Viagem"
        onAction={() => router.navigate('/(driver)/trip')}
      />
    )
  }

  // A câmera não montou: sem esta guarda a tela fica preta com a moldura e nada
  // acontece nunca, porque `onBarcodeScanned` não dispara.
  if (cameraError) {
    return (
      <Blocked
        title="Não foi possível abrir a câmera"
        detail={cameraError}
        actionLabel="Tentar novamente"
        onAction={() => setCameraError(null)}
      />
    )
  }

  // ---- Estado 5 em diante: câmera na tela ----

  const isPaused = result.kind !== 'idle'
  // Quando existe uma ação primária branca no overlay (retry ou "Ir para
  // Viagem"), "Escanear próximo" vira secundária — dois botões brancos
  // contained empilhados não teriam hierarquia nenhuma.
  const hasPrimaryAction =
    result.kind === 'failure' && (result.canRetry || result.code === 'TRIP_NOT_ACTIVE')

  return (
    <View style={styles.container}>
      {isFocused ? (
        <QrScanner onScan={handleScan} isPaused={isPaused} onMountError={setCameraError} />
      ) : (
        // Fora de foco: moldura preta estática. O que importa é o CameraView
        // DESMONTAR — a câmera fica livre enquanto o motorista está na lista.
        <View style={styles.offscreen} />
      )}

      {/* `box-none`: a barra não intercepta toques (a câmera continua atrás),
          mas o botão "Ver lista" dentro dela sim. */}
      <View style={styles.counterBar} pointerEvents="box-none">
        <Text variant="titleMedium" style={styles.counterText}>
          {boardedCount === 1
            ? '1 embarque nesta sessão'
            : `${boardedCount} embarques nesta sessão`}
        </Text>
        {/* `navigate`, nunca `push`: dois toques rápidos empilhavam duas telas
            (finding da 3.2b). */}
        <Button
          mode="contained"
          compact
          buttonColor="rgba(255, 255, 255, 0.16)"
          textColor="#FFFFFF"
          onPress={() => router.navigate('/(driver)/student-list')}
          style={styles.listButton}
          contentStyle={styles.listButtonContent}
          labelStyle={styles.listButtonLabel}
        >
          Ver lista
        </Button>
      </View>

      {result.kind === 'checking' ? (
        <View style={[styles.overlay, { backgroundColor: '#263238' }]}>
          <View style={styles.overlayMessage}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text variant="headlineSmall" style={styles.overlayTitle}>
              Verificando...
            </Text>
          </View>
        </View>
      ) : result.kind === 'success' ? (
        <View style={[styles.overlay, { backgroundColor: TONE_COLOR.success }]}>
          <View style={styles.overlayMessage}>
            <Text style={styles.icon}>✓</Text>
            <Text variant="headlineSmall" style={styles.overlayTitle}>
              {result.title}
            </Text>
            <Text variant="titleMedium" style={styles.overlayDetail}>
              {result.detail}
            </Text>
          </View>
          <View style={styles.overlayActions}>
            <Button
              mode="contained"
              buttonColor="#FFFFFF"
              textColor={TONE_COLOR.success}
              onPress={resume}
              style={styles.action}
              contentStyle={styles.actionContent}
              labelStyle={styles.actionLabel}
            >
              Escanear próximo
            </Button>
          </View>
        </View>
      ) : result.kind === 'failure' ? (
        <View style={[styles.overlay, { backgroundColor: TONE_COLOR[result.tone] }]}>
          <View style={styles.overlayMessage}>
            <Text style={styles.icon}>{feedbackIcon(result)}</Text>
            <Text variant="headlineSmall" style={styles.overlayTitle}>
              {result.title}
            </Text>
            <Text variant="titleMedium" style={styles.overlayDetail}>
              {result.detail}
            </Text>
          </View>
          <View style={styles.overlayActions}>
            {result.canRetry ? (
              <Button
                mode="contained"
                buttonColor="#FFFFFF"
                textColor={TONE_COLOR[result.tone]}
                onPress={handleRetry}
                style={styles.action}
                contentStyle={styles.actionContent}
                labelStyle={styles.actionLabel}
              >
                Tentar novamente
              </Button>
            ) : null}
            {/* Estado 12 é a única linha da Tabela de Verdade que pede esta
                afordância: sem ela o motorista lê "Inicie uma viagem antes de
                registrar embarques" sem nenhum caminho até lá. */}
            {result.code === 'TRIP_NOT_ACTIVE' ? (
              <Button
                mode="contained"
                buttonColor="#FFFFFF"
                textColor={TONE_COLOR[result.tone]}
                onPress={() => router.navigate('/(driver)/trip')}
                style={styles.action}
                contentStyle={styles.actionContent}
                labelStyle={styles.actionLabel}
              >
                Ir para Viagem
              </Button>
            ) : null}
            {/* Cores explícitas: `outlined`/`contained-tonal` derivam do tema
                (primária #208AEF) e ficam ilegíveis sobre vermelho ou âmbar. */}
            <Button
              mode={hasPrimaryAction ? 'text' : 'contained'}
              buttonColor={hasPrimaryAction ? undefined : '#FFFFFF'}
              textColor={hasPrimaryAction ? '#FFFFFF' : TONE_COLOR[result.tone]}
              onPress={resume}
              style={styles.action}
              contentStyle={styles.actionContent}
              labelStyle={styles.actionLabel}
            >
              Escanear próximo
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      <Text variant="bodyLarge" style={styles.centeredText}>
        {label}
      </Text>
    </View>
  )
}

function Blocked({
  title,
  detail,
  actionLabel,
  onAction,
  note,
}: {
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
  /** Mensagem extra quando a própria ação do botão falha. */
  note?: string | null
}) {
  return (
    <View style={styles.centered}>
      <Text variant="titleLarge" style={styles.centeredTitle}>
        {title}
      </Text>
      <Text variant="bodyLarge" style={styles.centeredText}>
        {detail}
      </Text>
      {note ? (
        <Text variant="bodyLarge" style={styles.centeredNote}>
          {note}
        </Text>
      ) : null}
      <Button
        mode="contained"
        onPress={onAction}
        style={styles.action}
        contentStyle={styles.actionContent}
        labelStyle={styles.actionLabel}
      >
        {actionLabel}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  offscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  centeredTitle: {
    textAlign: 'center',
  },
  centeredText: {
    textAlign: 'center',
    opacity: 0.75,
  },
  centeredNote: {
    textAlign: 'center',
    color: '#B3261E',
    fontWeight: 'bold',
  },
  counterBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '700',
  },
  listButton: {
    marginTop: 10,
    alignSelf: 'center',
    borderRadius: 10,
  },
  listButtonContent: {
    height: 44,
    paddingHorizontal: 12,
  },
  listButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  // Overlay de resultado cobrindo a tela inteira: em movimento, o motorista não
  // tem tempo de procurar um snackbar no rodapé (NFR18).
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 24,
  },
  // Mensagem ocupa o espaço livre e fica centrada; as ações são empurradas para
  // a metade inferior. Com tudo numa pilha `justifyContent: 'center'`, os botões
  // caíam no meio da tela, fora do alcance do polegar de quem segura o aparelho
  // com uma mão só (NFR18 / Task 7.10).
  overlayMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  overlayActions: {
    alignSelf: 'stretch',
    gap: 12,
    paddingBottom: 32,
  },
  icon: {
    fontSize: 72,
    lineHeight: 80,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  overlayTitle: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // NFR18 / Task 7.10: >= 18sp e em negrito. `titleMedium` do MD3 resolve para
  // 16sp com peso 500, e a opacidade reduzida piorava ainda mais a leitura em
  // movimento — é esta linha que carrega o "por quê" do resultado.
  overlayDetail: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // NFR18: alvo de toque de 56dp, alinhado ao precedente de `(driver)/trip.tsx`.
  action: {
    marginTop: 12,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  actionContent: {
    height: 56,
  },
  actionLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
})
