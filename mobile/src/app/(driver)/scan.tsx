import * as Crypto from 'expo-crypto'
import { useFocusEffect } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'
import { useCameraPermissions } from 'expo-camera'

import { QrScanner } from '@/components/qr-scanner'
import {
  CameraPermissionState,
  NoActiveTripState,
  RoleGuardState,
} from '@/components/scan/scan-blocked-states'
import { ScanHud } from '@/components/scan/scan-hud'
import { ScanResultOverlay, type ScanResult } from '@/components/scan/scan-result-overlay'
import { StateView } from '@/components/ui/state-view'
import { notifyQueueChanged } from '@/hooks/use-offline-sync'
import { sqliteQueueStorage } from '@/lib/offline-queue-storage'
import { boardingService } from '@/services/boarding.service'
import { ApiClientError } from '@/services/api-client'
import { activeTripOptions, tripStudentsKey, tripStudentsOptions } from '@/lib/trip-queries'
import { useAuthStore } from '@/stores/auth.store'
import { enqueueCheckIn, isTransportFailure, type QueueOwner } from '@/utils/offline-queue'
import { decodeQrPayload } from '@/utils/qr-payload'
import { registerE2eScanHook } from '@/utils/e2e-scan-hook'
import { describeFailure, QUEUE_FULL_FEEDBACK, QUEUED_FEEDBACK } from '@/utils/scan-feedback'
import { tripBoardedCount } from '@/utils/trip-boarded-count'

// Quanto tempo o resultado de SUCESSO fica na tela antes de a câmera voltar
// sozinha. Só o sucesso auto-retoma: nos estados de erro o motorista precisa ler
// o que aconteceu antes de continuar.
const SUCCESS_RESUME_MS = 2500

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
  /** D4: quem escaneou — o item só drena de volta para ESTA identidade. */
  owner: QueueOwner
}

// Read from the cached roster, never fetched: the name must show offline too.
function cachedStudentName(queryClient: QueryClient, attempt: Attempt): string | undefined {
  return queryClient
    .getQueryData(tripStudentsOptions(attempt.tripId).queryKey)
    ?.students.find((student) => student.studentId === attempt.studentId)?.name
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
  // Students accepted on this screen (server or queue), one entry per check-in:
  // its length is the session line, and the ids feed the optimistic trip count.
  const [sessionStudentIds, setSessionStudentIds] = useState<string[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
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
  const { data: roster } = useQuery(
    tripStudentsOptions(activeTrip?.status === 'ACTIVE' ? activeTrip.id : undefined),
  )

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
        owner: attempt.owner,
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
      setSessionStudentIds((ids) => [...ids, attempt.studentId])
      setResult({
        kind: 'success',
        title: 'Embarque confirmado',
        detail: 'Aluno registrado nesta viagem.',
        studentName: cachedStudentName(queryClient, attempt),
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
          setSessionStudentIds((ids) => [...ids, attempt.studentId])
          setResult({
            kind: 'failure',
            ...described,
            studentName: cachedStudentName(queryClient, attempt),
          })
          resumeTimer.current = setTimeout(() => {
            resumeTimer.current = null
            lastAttempt.current = null
            isBusy.current = false
            setResult({ kind: 'idle' })
          }, SUCCESS_RESUME_MS)
          return
        }
        setResult({
          kind: 'failure',
          ...described,
          studentName: cachedStudentName(queryClient, attempt),
        })
        return
      }

      const described = describeFailure(error)
      setResult({
        kind: 'failure',
        ...described,
        studentName: cachedStudentName(queryClient, attempt),
      })
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

      // Invariante, não estado da tabela: o caminho de render devolve o `StateView`
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
        // O dono é a sessão que vai assinar o POST do dreno — o userId do
        // token e a empresa da viagem ativa (D4).
        owner: { userId: user.id, companyId: activeTrip.companyId },
      }
      lastAttempt.current = attempt
      void submit(attempt)
    },
    [activeTrip, submit, user],
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

  if (!user || user.role !== 'DRIVER') {
    return <RoleGuardState logout={logout} />
  }

  // Estados 1 e 2 da Tabela de Verdade.
  if (!permission) {
    // O hook ainda não resolveu o estado da permissão.
    return <StateView kind="loading" title="Preparando câmera..." />
  }

  if (!permission.granted) {
    return (
      <CameraPermissionState
        canAskAgain={permission.canAskAgain}
        requestPermission={requestPermission}
      />
    )
  }

  // Estado 3: `status === 'pending'` e não `isLoading` — com a query pausada
  // (offline) `isLoading` é false e a tela afirmaria "sem viagem ativa" sem
  // nunca ter buscado. Finding literal do review da 3.2b.
  if (tripStatus === 'pending') {
    return <StateView kind="loading" title="Carregando viagem..." />
  }

  // Erro NÃO é vazio — sem esta guarda a query que terminou em `error` cai no
  // estado 4 e a tela afirma "Nenhuma viagem ativa" sem nunca ter conseguido
  // buscar (finding (b) da 3.2b, ação #4 da retro do Épico 2). Com o
  // `networkMode: 'always'` global, erro COM viagem em cache (refetch offline
  // no meio da sessão) não bloqueia: o scan segue do cache e os check-ins
  // enfileiram offline. Só erro sem dado nenhum é tela de bloqueio.
  if (tripStatus === 'error' && activeTrip === undefined) {
    return (
      <StateView
        kind="error"
        title="Não foi possível carregar a viagem"
        detail="Verifique sua conexão e tente novamente."
        action={{
          label: 'Tentar novamente',
          onPress: () => void refetchTrip(),
        }}
      />
    )
  }

  // Estado 4.
  if (!activeTrip || activeTrip.status !== 'ACTIVE') {
    return <NoActiveTripState />
  }

  // A câmera não montou: sem esta guarda a tela fica preta com a moldura e nada
  // acontece nunca, porque `onBarcodeScanned` não dispara.
  if (cameraError) {
    return (
      <StateView
        kind="error"
        title="Não foi possível abrir a câmera"
        detail={cameraError}
        action={{
          label: 'Tentar novamente',
          onPress: () => setCameraError(null),
        }}
      />
    )
  }

  // ---- Estado 5 em diante: câmera na tela ----

  const isPaused = result.kind !== 'idle'

  return (
    <View style={styles.container}>
      {isFocused ? (
        <QrScanner onScan={handleScan} isPaused={isPaused} onMountError={setCameraError} />
      ) : (
        // Fora de foco: moldura preta estática. O que importa é o CameraView
        // DESMONTAR — a câmera fica livre enquanto o motorista está na lista.
        <View style={styles.offscreen} />
      )}

      <ScanHud
        count={tripBoardedCount(roster, sessionStudentIds)}
        sessionCount={sessionStudentIds.length}
      />

      <ScanResultOverlay
        result={result}
        onResume={resume}
        onRetry={handleRetry}
        autoResumeMs={SUCCESS_RESUME_MS}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Fundos pretos da câmera/offscreen: chrome de câmera (allowlist da guarda) —
  // a paleta do DESIGN.md não tem preto puro.
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  offscreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
})
