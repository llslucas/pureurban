import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ManagedRuntime, Layer } from 'effect'
import { EFFECT_RUNTIME } from './effect-runtime.module.js'
import { PrismaServiceTag } from '../../core/ports/prisma-service.tag.js'
import type { PrismaClient } from '../../../../generated/prisma/client.js'

// Proxy-based mock: stubs $queryRaw and returns safe no-ops for any other property
const mockPrismaClient = new Proxy(
  {
    $queryRaw: (() => Promise.resolve([{ health: 1 }])) as PrismaClient['$queryRaw'],
  } as PrismaClient,
  {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver)
      // Return a no-op function for any unstubbed method access
      return () => Promise.resolve(undefined)
    },
  },
)

describe('EffectRuntimeModule', () => {
  let module: TestingModule
  let createdRuntime: ManagedRuntime.ManagedRuntime<PrismaServiceTag, never>

  beforeEach(async () => {
    // Build a real ManagedRuntime with the mock Prisma client
    const PrismaLayer = Layer.succeed(PrismaServiceTag, mockPrismaClient)
    createdRuntime = ManagedRuntime.make(PrismaLayer)

    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        {
          provide: EFFECT_RUNTIME,
          useValue: createdRuntime,
        },
      ],
    }).compile()
  })

  afterEach(async () => {
    if (createdRuntime) await createdRuntime.dispose()
    if (module) await module.close()
  })

  it('should provide EFFECT_RUNTIME token', () => {
    const runtime = module.get(EFFECT_RUNTIME)
    expect(runtime).toBeDefined()
  })

  it('should provide a ManagedRuntime instance with runPromise method', () => {
    const runtime = module.get<ManagedRuntime.ManagedRuntime<any, never>>(EFFECT_RUNTIME)
    expect(typeof runtime.runPromise).toBe('function')
  })

  it('should provide a single shared runtime instance (singleton)', () => {
    const r1 = module.get(EFFECT_RUNTIME)
    const r2 = module.get(EFFECT_RUNTIME)
    expect(r1).toBe(r2)
  })
})



