import { Injectable, Inject } from '@nestjs/common'
import type { ManagedRuntime } from 'effect'
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js'
import { createDriver } from '../core/use-cases/create-driver.use-case.js'
import { listDrivers } from '../core/use-cases/list-drivers.use-case.js'
import { getDriver } from '../core/use-cases/get-driver.use-case.js'
import { updateDriver } from '../core/use-cases/update-driver.use-case.js'
import { deactivateDriver } from '../core/use-cases/deactivate-driver.use-case.js'
import type { CreateDriverInput } from '../core/schemas/create-driver.schema.js'
import type { UpdateDriverInput } from '../core/schemas/update-driver.schema.js'

export const DRIVER_RUNTIME = 'DRIVER_RUNTIME'

@Injectable()
export class DriverService {
  constructor(
    @Inject(DRIVER_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async create(input: CreateDriverInput, companyId: string) {
    const user = await this.eventDispatcher.runAndDispatch(this.runtime, createDriver(input, companyId))
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }

  async list(companyId: string, isActive?: boolean) {
    const users = await this.eventDispatcher.runAndDispatch(this.runtime, listDrivers({ companyId, isActive }))
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }))
  }

  async getById(id: string, companyId: string) {
    const user = await this.eventDispatcher.runAndDispatch(this.runtime, getDriver({ id, companyId }))
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }

  async update(id: string, companyId: string, data: UpdateDriverInput) {
    const user = await this.eventDispatcher.runAndDispatch(this.runtime, updateDriver({ id, companyId, data }))
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }

  async deactivate(id: string, companyId: string) {
    const user = await this.eventDispatcher.runAndDispatch(this.runtime, deactivateDriver({ id, companyId }))
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }
}
