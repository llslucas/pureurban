import { consumeDiscardNotice } from '@/lib/offline-discard-notice'
import { registerOfflineQueueLifecycle } from '@/lib/offline-queue-lifecycle'
import { useAuthStore } from '@/stores/auth.store'
import type { AuthUser } from '@/services/auth.service'
import type { QueueStatus, QueueStorage } from '@/utils/offline-queue'

// Purga da fila no logout (D5/AC7). O logout do motorista parte do "Sair" do
// header (story 6.3) ou de caminho programático (401 do api-client, guardas de
// role). Por isso o aviso de descarte é consumido na TELA DE LOGIN: é a única
// superfície que toda saída de sessão atravessa.

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
    remove: () => undefined,
  }),
}))

const DRIVER = { id: 'driver-1', name: 'Ana', email: 'a@x.co', role: 'DRIVER' } as const

function fakeStorage(pendingByUser: Map<string, number>): QueueStorage {
  return {
    insert: jest.fn(),
    listPending: jest.fn(() => Promise.resolve([])),
    markSent: jest.fn(),
    markFailed: jest.fn(),
    bumpAttempt: jest.fn(),
    count: jest.fn((status: QueueStatus, userId: string) =>
      Promise.resolve(status === 'pending' ? (pendingByUser.get(userId) ?? 0) : 0),
    ),
    purgeSentBefore: jest.fn(() => Promise.resolve()),
    purgeUser: jest.fn(() => Promise.resolve()),
    deleteFailed: jest.fn(() => Promise.resolve()),
  }
}

const logoutAs = async (user: AuthUser) => {
  useAuthStore.setState({ user, isAuthenticated: true })
  useAuthStore.getState().logout()
  // O listener é async (conta → purga → aviso): esgota os microtasks antes de
  // asserir, senão a purga ainda não aconteceu.
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe('offline-queue-lifecycle — purga no logout e aviso de descarte (D5/AC7)', () => {
  // O Set de listeners vive no módulo do auth.store: sem o unregister cada
  // teste vaza o storage do anterior na mesma saída de sessão.
  const unregisters: (() => void)[] = []

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    for (const unregister of unregisters) unregister()
    unregisters.length = 0
  })

  it('D6/AC8: o registro (boot do app) purga `sent` com o corte de 7 dias, para qualquer sessão', async () => {
    const storage = fakeStorage(new Map())
    unregisters.push(registerOfflineQueueLifecycle(storage))
    await Promise.resolve()

    expect(storage.purgeSentBefore).toHaveBeenCalledTimes(1)
    const [cutoff] = (storage.purgeSentBefore as jest.Mock).mock.calls[0]
    // Tolerância de relógio: o corte é "agora - 7 dias" no instante do registro.
    expect(Math.abs(Date.parse(cutoff) - (Date.now() - 7 * 24 * 3600_000))).toBeLessThan(5_000)
  })

  it('logout com fila pendente: purga o usuário e publica o aviso com N', async () => {
    const pending = new Map([['driver-1', 3]])
    const storage = fakeStorage(pending)
    unregisters.push(registerOfflineQueueLifecycle(storage))

    await logoutAs({ ...DRIVER })

    expect(storage.purgeUser).toHaveBeenCalledWith('driver-1')
    await expect(consumeDiscardNotice()).resolves.toEqual({ count: 3 })
  })

  it('o aviso é publicado como PROMISE no despacho do logout — o login pode montar antes da purga terminar', async () => {
    // Regressão do achado de review (race do mount): se a publicação esperasse o
    // resultado, o login consumiria null e o aviso se perderia.
    let resolvePurge: ((count: number) => void) | undefined
    const storage = fakeStorage(new Map())
    ;(storage.count as jest.Mock).mockImplementation(() => {
      return new Promise<number>((resolve) => {
        resolvePurge = (count: number) => resolve(count)
      })
    })
    unregisters.push(registerOfflineQueueLifecycle(storage))

    useAuthStore.setState({ user: { ...DRIVER }, isAuthenticated: true })
    useAuthStore.getState().logout()

    // Antes da purga resolver, o consumidor já tem uma promise pendente — não null.
    const consumed = consumeDiscardNotice()
    expect(consumed).toBeInstanceOf(Promise)

    resolvePurge?.(4)
    await expect(consumed).resolves.toEqual({ count: 4 })
    expect(storage.purgeUser).toHaveBeenCalledWith('driver-1')
  })

  it('logout com fila vazia: purga mesmo assim e NÃO publica aviso', async () => {
    const storage = fakeStorage(new Map())
    unregisters.push(registerOfflineQueueLifecycle(storage))

    await logoutAs({ ...DRIVER })

    expect(storage.purgeUser).toHaveBeenCalledWith('driver-1')
    await expect(consumeDiscardNotice()).resolves.toBeNull()
  })

  it('o aviso é de consumo único: remount do login sem logout novo não repete', async () => {
    const storage = fakeStorage(new Map([['driver-1', 2]]))
    unregisters.push(registerOfflineQueueLifecycle(storage))

    await logoutAs({ ...DRIVER })
    await expect(consumeDiscardNotice()).resolves.toEqual({ count: 2 })
    await expect(consumeDiscardNotice()).resolves.toBeNull()
  })

  it('logout de usuário SEM itens não apaga a fila de outro', async () => {
    const storage = fakeStorage(new Map([['driver-1', 2]]))
    unregisters.push(registerOfflineQueueLifecycle(storage))

    await logoutAs({ ...DRIVER, id: 'admin-9', role: 'ADMIN' })

    expect(storage.purgeUser).toHaveBeenCalledWith('admin-9')
    // A purga é por usuário; a contagem de driver-1 jamais foi consultada.
    expect(storage.count).not.toHaveBeenCalledWith('pending', 'driver-1')
    await expect(consumeDiscardNotice()).resolves.toBeNull()
  })
})
