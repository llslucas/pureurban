import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { startConnectivityListeners } from '@/lib/connectivity'
import { sqliteQueueStorage } from '@/lib/offline-queue-storage'
import { boardingService } from '@/services/boarding.service'
import { useAppStore } from '@/stores/app.store'
import {
  buildCheckInSender,
  drainQueue,
  MAX_BACKOFF_MS,
  type QueueStorage,
} from '@/utils/offline-queue'

// Sinal "acabei de enfileirar um item" para a tela de scan acordar o dreno sem
// conhecer o agendador. Um Set module-level, e não um contexto React: o
// escaneamento acontece numa tela filha e o hook vive no layout do grupo.
const listeners = new Set<() => void>()

export function notifyQueueChanged(): void {
  for (const listener of listeners) listener()
}

export interface OfflineSyncState {
  pendingCount: number
  failedCount: number
}

export function useOfflineSync(storage: QueueStorage = sqliteQueueStorage): OfflineSyncState {
  const [counts, setCounts] = useState<OfflineSyncState>({
    pendingCount: 0,
    failedCount: 0,
  })

  const isMounted = useRef(true)
  // Um dreno em voo por vez: sem isto o gatilho do `online` e o timer do backoff
  // se sobrepõem e o mesmo item é enviado duas vezes. Ref, e não state, porque
  // precisa fechar na mesma instrução.
  const isDraining = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // `runDrain` se reagenda; a indireção pelo ref evita a dependência circular
  // entre o callback e o `setTimeout` que o chama.
  const runDrainRef = useRef<() => Promise<void>>(async () => undefined)
  // Falhas de transporte consecutivas: escalonam o backoff até o teto de 30s sem
  // consumir as tentativas do item. Deliberadamente em memória — num túnel longo
  // o item espera, e reabrir o app recomeça do primeiro degrau.
  const transportFailures = useRef(0)
  // Um pedido de dreno que chegou durante outro dreno. Sem isto o sinal é
  // DESCARTADO: o item enfileirado a meio de um dreno que terminou com a fila
  // vazia não reagenda timer nenhum e fica pendente até o próximo scan.
  const wakeRequested = useRef(false)

  const send = useMemo(() => buildCheckInSender(boardingService), [])

  const schedule = useCallback((delayMs: number | null) => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (delayMs === null || !isMounted.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      void runDrainRef.current()
    }, delayMs)
  }, [])

  const runDrain = useCallback(async () => {
    if (isDraining.current) {
      wakeRequested.current = true
      return
    }
    isDraining.current = true
    try {
      const summary = await drainQueue(storage, send, {
        transportFailures: transportFailures.current,
      })
      transportFailures.current = summary.transportFailures
      const [pendingCount, failedCount] = await Promise.all([
        storage.count('pending'),
        storage.count('failed'),
      ])
      if (!isMounted.current) return
      setCounts({ pendingCount, failedCount })
      schedule(summary.nextDelayMs)
    } catch (error: unknown) {
      // Só o storage chega aqui — `drainQueue` já absorve os erros de rede. Na
      // prática significa banco local indisponível (OPFS sem
      // `crossOriginIsolated`, por exemplo). Reagendar no teto do backoff evita
      // um laço quente contra um banco que não vai abrir.
      console.error('[offline-sync] falha ao drenar a fila:', error)
      schedule(MAX_BACKOFF_MS)
    } finally {
      isDraining.current = false
      if (wakeRequested.current) {
        wakeRequested.current = false
        void runDrainRef.current()
      }
    }
  }, [schedule, send, storage])

  // Em efeito, não no corpo do render: com o React Compiler ligado, escrever num
  // ref durante o render é justamente o padrão que ele reordena.
  useEffect(() => {
    runDrainRef.current = runDrain
  })

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  // Retoma sozinho no boot: os itens que sobreviveram ao fechamento do app
  // continuam `pending` com `attempts` preservado (NFR11).
  useEffect(() => {
    void runDrain()
  }, [runDrain])

  useEffect(() => startConnectivityListeners(), [])

  useEffect(() => {
    return useAppStore.subscribe((state, prev) => {
      if (state.isOnline && !prev.isOnline) {
        // A rede voltou: o próximo dreno recomeça do primeiro degrau em vez de
        // herdar o teto de 30s acumulado no túnel. Zerar antes de `runDrain`
        // vale mesmo se houver um dreno em voo — ele reagenda pelo `wakeRequested`.
        transportFailures.current = 0
        void runDrain()
      }
    })
  }, [runDrain])

  useEffect(() => {
    const listener = () => void runDrain()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [runDrain])

  return counts
}
