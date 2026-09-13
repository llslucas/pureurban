import { setDiscardNotice } from './offline-discard-notice'
import { registerLogoutListener } from '@/stores/auth.store'
import { sqliteQueueStorage } from './offline-queue-storage'
import { SENT_RETENTION_MS, type QueueStorage } from '@/utils/offline-queue'

// Purga da fila no logout (D5/AC7). Registro ÚNICO no boot do app (root layout,
// com unregister no cleanup do efeito): o logout pode partir de qualquer tela —
// 401 no api-client, guarda de role, botão de admin — e a purga tem que valer
// em todas. Por isso não vive no layout do motorista, que desmonta exatamente
// no logout.

export function registerOfflineQueueLifecycle(
  storage: QueueStorage = sqliteQueueStorage,
): () => void {
  // D6/AC8: `sent` é histórico — a purga do boot roda no registro, no root
  // layout, para qualquer sessão (não só quando o layout do motorista monta).
  void storage
    .purgeSentBefore(new Date(Date.now() - SENT_RETENTION_MS).toISOString())
    .catch((error: unknown) => console.error('[offline-queue] falha ao purgar sent:', error))

  return registerLogoutListener((user) => {
    // A PROMISE é publicada antes do primeiro await: o logout navega para o
    // login imediatamente, e é o login quem consome o aviso — publicar só o
    // resultado (depois da purga) perdia o aviso na corrida com o mount.
    setDiscardNotice(
      (async () => {
        // O aviso conta o que o motorista PERDE: pendentes nunca enviados. `sent`
        // e `failed` já cumpriram o seu papel (entregue/reconhecível), os órfãos
        // sem dono a purga leva de brinde.
        const discardedPending = await storage.count('pending', user.id)
        await storage.purgeUser(user.id)
        return discardedPending > 0 ? { count: discardedPending } : null
      })().catch((error: unknown) => {
        console.error('[offline-queue] falha ao purgar a fila no logout:', error)
        return null
      }),
    )
  })
}
