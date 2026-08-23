import * as Crypto from 'expo-crypto'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { ActivityIndicator, Button, Text } from 'react-native-paper'
import { useQuery } from '@tanstack/react-query'
import { useCameraPermissions } from 'expo-camera'

import { QrScanner } from '@/components/qr-scanner'
import { boardingService } from '@/services/boarding.service'
import { ApiClientError } from '@/services/api-client'
import { tripService, type Trip } from '@/services/trip.service'
import { useAuthStore } from '@/stores/auth.store'
import { decodeQrPayload } from '@/utils/qr-payload'

// Quanto tempo o resultado de SUCESSO fica na tela antes de a câmera voltar
// sozinha. Só o sucesso auto-retoma: nos estados de erro o motorista precisa ler
// o que aconteceu antes de continuar.
const SUCCESS_RESUME_MS = 2500

type Tone = 'success' | 'warn' | 'error' | 'offline'

// Union discriminado em vez de booleanos soltos (architecture.md §6). Com
// booleanos, `isChecking && isError` é representável e significa nada.
type ScanResult =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'success'; title: string; detail: string }
  | {
      kind: 'failure'
      // `code` é preservado no estado, e não só traduzido em texto: sem ele o
      // código da falha não é recuperável para log nem para a fila da 3.4b
      // (Task 7.3). 'NETWORK_ERROR' é o sintético do fetch cru.
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
}

const TONE_COLOR: Record<Tone, string> = {
  // Verde/âmbar/vermelho/cinza-escuro sobre o preto da câmera — contraste alto,
  // legível em movimento e sob sol direto (NFR18).
  success: '#1B7F3B',
  warn: '#B26A00',
  error: '#B3261E',
  offline: '#37474F',
}

/**
 * Traduz a falha em feedback visual, conforme a Tabela de Verdade da story.
 *
 * O `default` não é defensivo por educação: o contrato declara mais códigos do
 * que a AC #3 lista, e a Story 3.3a pode acrescentar outros. Sem ele, um código
 * novo vira overlay em branco — o motorista não saberia se embarcou ou não.
 */
function describeFailure(error: unknown): {
  code: string
  tone: Tone
  title: string
  detail: string
  canRetry: boolean
} {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'DUPLICATE_CHECK_IN':
        // Âmbar, não vermelho: o aluno ESTÁ no ônibus, o objetivo do motorista
        // foi atingido. Pintar de vermelho ensina o motorista a ignorar vermelho.
        return {
          code: 'DUPLICATE_CHECK_IN',
          tone: 'warn',
          title: 'Já embarcou',
          detail: 'Este aluno já fez check-in nesta viagem.',
          canRetry: false,
        }
      case 'STUDENT_NOT_ALLOWED':
        return {
          code: 'STUDENT_NOT_ALLOWED',
          tone: 'error',
          title: 'Aluno não autorizado',
          detail: 'Este aluno não está vinculado à rota desta viagem.',
          canRetry: false,
        }
      case 'TRIP_NOT_ACTIVE':
        return {
          code: 'TRIP_NOT_ACTIVE',
          tone: 'error',
          title: 'Viagem não está ativa',
          detail: 'Inicie uma viagem antes de registrar embarques.',
          canRetry: false,
        }
      case 'DRIVER_NOT_ASSIGNED':
        return {
          code: 'DRIVER_NOT_ASSIGNED',
          tone: 'error',
          title: 'Viagem de outro motorista',
          detail: 'Você não é o responsável por esta viagem.',
          canRetry: false,
        }
      case 'INVALID_QR_CODE':
        return {
          code: 'INVALID_QR_CODE',
          tone: 'error',
          title: 'QR code inválido',
          detail: 'Peça ao aluno para abrir o QR code no app novamente.',
          canRetry: false,
        }
      case 'REQUEST_TIMEOUT':
        return {
          code: 'REQUEST_TIMEOUT',
          tone: 'offline',
          title: 'Sem resposta',
          detail: 'O servidor demorou demais. Tente novamente.',
          canRetry: true,
        }
      // MISSING_IDEMPOTENCY_KEY, INVALID_IDEMPOTENCY_KEY e
      // IDEMPOTENCY_KEY_CONFLICT só acontecem por bug do cliente. Não há ação
      // útil para o motorista além de repetir a leitura, e reenviar a mesma
      // chave não ajudaria — por isso `canRetry: false`.
      case 'MISSING_IDEMPOTENCY_KEY':
      case 'INVALID_IDEMPOTENCY_KEY':
      case 'IDEMPOTENCY_KEY_CONFLICT':
        return {
          code: error.code,
          tone: 'error',
          title: 'Erro ao registrar',
          detail: 'Não foi possível registrar o embarque. Escaneie novamente.',
          canRetry: false,
        }
      default:
        return {
          code: error.code,
          tone: 'error',
          title: 'Erro ao registrar',
          detail: error.message,
          canRetry: true,
        }
    }
  }

  // Falha crua do fetch (sem rede, DNS, servidor fora do ar). A fila offline é a
  // Story 3.4b — aqui o motorista reenvia manualmente, com a mesma chave.
  return {
    code: 'NETWORK_ERROR',
    tone: 'offline',
    title: 'Sem conexão',
    detail: 'Não foi possível falar com o servidor. Tente novamente.',
    canRetry: true,
  }
}

export default function ScanScreen() {
  const { user } = useAuthStore()
  const [permission, requestPermission] = useCameraPermissions()
  const [result, setResult] = useState<ScanResult>({ kind: 'idle' })
  const [boardedCount, setBoardedCount] = useState(0)
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

  const {
    data: activeTrip,
    status: tripStatus,
    refetch: refetchTrip,
  } = useQuery<Trip | null>({
    // MESMA query key de `(driver)/trip.tsx`. Duas keys para o mesmo endpoint
    // foi finding de review na 3.2b: o cache duplica e as telas divergem.
    queryKey: ['activeTrip'],
    queryFn: () => tripService.getActiveTrip(),
    staleTime: 10_000,
    retry: 2,
  })

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

  const submit = useCallback(async (attempt: Attempt) => {
    // `checking` é definido pelo chamador ANTES do await — ver `handleScan`.
    try {
      await boardingService.checkIn(
        { studentId: attempt.studentId, tripId: attempt.tripId },
        attempt.idempotencyKey,
      )
      lastSuccessStudentId.current = attempt.studentId
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
      const described = describeFailure(error)
      setResult({ kind: 'failure', ...described })
    }
  }, [])

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

      if (!activeTrip || activeTrip.status !== 'ACTIVE') {
        setResult({
          kind: 'failure',
          code: 'TRIP_NOT_ACTIVE',
          tone: 'error',
          title: 'Viagem não está ativa',
          detail: 'Inicie uma viagem antes de registrar embarques.',
          canRetry: false,
        })
        return
      }

      const attempt: Attempt = {
        studentId: payload.studentId,
        tripId: activeTrip.id,
        // Uma chave por tentativa (Architecture §5, Tier 2). O retry reusa esta
        // mesma chave; QR novo gera chave nova.
        idempotencyKey: Crypto.randomUUID(),
      }
      lastAttempt.current = attempt
      void submit(attempt)
    },
    [activeTrip, submit],
  )

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
        actionLabel="Voltar"
        onAction={() => router.replace('/(auth)/login')}
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
        onAction={() => void requestPermission()}
      />
    ) : (
      <Blocked
        title="Câmera bloqueada"
        detail="A permissão foi negada. Libere o acesso à câmera nas configurações do sistema."
        actionLabel="Abrir configurações"
        onAction={() => void Linking.openSettings()}
      />
    )
  }

  // Estado 3: `status === 'pending'` e não `isLoading` — com a query pausada
  // (offline) `isLoading` é false e a tela afirmaria "sem viagem ativa" sem
  // nunca ter buscado. Finding literal do review da 3.2b.
  if (tripStatus === 'pending') {
    return <Loading label="Carregando viagem..." />
  }

  // Erro NÃO é vazio. Sem esta guarda a query que terminou em `error` cai no
  // estado 4 e a tela afirma "Nenhuma viagem ativa" sem nunca ter conseguido
  // buscar — o finding (b) da 3.2b e a ação #4 da retro do Épico 2, alcançados
  // pela outra porta. Vale especialmente sem rede: o `onlineManager` nunca foi
  // ligado ao NetInfo (defer da 3.2b), então a query não pausa — ela queima o
  // `retry` ladder e falha.
  if (tripStatus === 'error') {
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

  // ---- Estado 5 em diante: câmera na tela ----

  const isPaused = result.kind !== 'idle'

  return (
    <View style={styles.container}>
      <QrScanner onScan={handleScan} isPaused={isPaused} />

      <View style={styles.counterBar} pointerEvents="none">
        <Text variant="titleMedium" style={styles.counterText}>
          {boardedCount === 1
            ? '1 embarque nesta sessão'
            : `${boardedCount} embarques nesta sessão`}
        </Text>
      </View>

      {result.kind === 'checking' ? (
        <View style={[styles.overlay, { backgroundColor: '#263238' }]}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text variant="headlineSmall" style={styles.overlayTitle}>
            Verificando...
          </Text>
        </View>
      ) : result.kind === 'success' ? (
        <View style={[styles.overlay, { backgroundColor: TONE_COLOR.success }]}>
          <Text style={styles.icon}>✓</Text>
          <Text variant="headlineSmall" style={styles.overlayTitle}>
            {result.title}
          </Text>
          <Text variant="titleMedium" style={styles.overlayDetail}>
            {result.detail}
          </Text>
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
      ) : result.kind === 'failure' ? (
        <View style={[styles.overlay, { backgroundColor: TONE_COLOR[result.tone] }]}>
          <Text style={styles.icon}>{result.tone === 'warn' ? '!' : '✕'}</Text>
          <Text variant="headlineSmall" style={styles.overlayTitle}>
            {result.title}
          </Text>
          <Text variant="titleMedium" style={styles.overlayDetail}>
            {result.detail}
          </Text>
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
          {/* Cores explícitas: `outlined`/`contained-tonal` derivam do tema
              (primária #208AEF) e ficam ilegíveis sobre vermelho ou âmbar. */}
          <Button
            mode={result.canRetry ? 'text' : 'contained'}
            buttonColor={result.canRetry ? undefined : '#FFFFFF'}
            textColor={result.canRetry ? '#FFFFFF' : TONE_COLOR[result.tone]}
            onPress={resume}
            style={styles.action}
            contentStyle={styles.actionContent}
            labelStyle={styles.actionLabel}
          >
            Escanear próximo
          </Button>
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
}: {
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <View style={styles.centered}>
      <Text variant="titleLarge" style={styles.centeredTitle}>
        {title}
      </Text>
      <Text variant="bodyLarge" style={styles.centeredText}>
        {detail}
      </Text>
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
    textAlign: 'center',
    fontWeight: '700',
  },
  // Overlay de resultado cobrindo a tela inteira: em movimento, o motorista não
  // tem tempo de procurar um snackbar no rodapé (NFR18).
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
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
  overlayDetail: {
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.92,
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
