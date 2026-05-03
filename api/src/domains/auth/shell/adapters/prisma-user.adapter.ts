import { Injectable } from '@nestjs/common'
import { Effect } from 'effect'
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js'
import { Prisma } from '../../../../generated/prisma/client.js'
import type { Role } from '../../../../generated/prisma/enums.js'
import type { UserRepository, UserData, CreateUserInput, CreateDriverData } from '../../core/ports/user-repository.port.js'
import { EmailAlreadyExistsError, DriverNotFoundError } from '../../core/errors/auth.errors.js'

@Injectable()
export class PrismaUserAdapter implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Effect.Effect<UserData | null> {
    return Effect.promise(() => this.prisma.user.findUnique({ where: { email } }))
  }

  findById(id: string): Effect.Effect<UserData | null> {
    return Effect.promise(() => this.prisma.user.findUnique({ where: { id } }))
  }

  create(data: CreateUserInput): Effect.Effect<UserData> {
    return Effect.promise(async () => {
      return this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: { name: data.companyName },
        })
        const user = await tx.user.create({
          data: {
            email: data.email,
            password: data.password,
            name: data.name,
            role: data.role as Role,
            companyId: company.id,
            isActive: true,
          },
        })
        return {
          id: user.id,
          email: user.email,
          password: user.password,
          name: user.name,
          role: user.role as string,
          companyId: user.companyId,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        } satisfies UserData
      })
    })
  }

  findManyByCompanyAndRole(
    companyId: string,
    role: string,
    filter?: { isActive?: boolean }
  ): Effect.Effect<UserData[]> {
    return Effect.promise(async () => {
      const users = await this.prisma.user.findMany({
        where: {
          companyId,
          role: role as Role,
          ...(filter?.isActive !== undefined && { isActive: filter.isActive }),
        },
        orderBy: { createdAt: 'desc' },
      })
      return users.map((user) => ({
        id: user.id,
        email: user.email,
        password: user.password,
        name: user.name,
        role: user.role as string,
        companyId: user.companyId,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }))
    })
  }

  findByIdAndCompanyAndRole(id: string, companyId: string, role: string): Effect.Effect<UserData | null> {
    return Effect.promise(async () => {
      const user = await this.prisma.user.findFirst({
        where: { id, companyId, role: role as Role },
      })
      if (!user) return null
      return {
        id: user.id,
        email: user.email,
        password: user.password,
        name: user.name,
        role: user.role as string,
        companyId: user.companyId,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    })
  }

  updatePartial(
    id: string,
    companyId: string,
    data: Partial<{ email: string; password: string; name: string; isActive: boolean }>
  ): Effect.Effect<UserData> {
    return Effect.promise(() =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findFirst({ where: { id, companyId } })
        if (!existing) {
          throw DriverNotFoundError.create(id)
        }

        const user = await tx.user.update({
          where: { id },
          data: {
            ...(data.email !== undefined && { email: data.email }),
            ...(data.password !== undefined && { password: data.password }),
            ...(data.name !== undefined && { name: data.name }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
          },
        })

        return {
          id: user.id,
          email: user.email,
          password: user.password,
          name: user.name,
          role: user.role as string,
          companyId: user.companyId,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      })
    )
  }

  createDriver(data: CreateDriverData): Effect.Effect<UserData> {
    return Effect.promise(async () => {
      try {
        const user = await this.prisma.user.create({
          data: {
            email: data.email,
            password: data.password,
            name: data.name,
            role: 'DRIVER',
            companyId: data.companyId,
            isActive: true,
          },
        })

        return {
          id: user.id,
          email: user.email,
          password: user.password,
          name: user.name,
          role: user.role as string,
          companyId: user.companyId,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw EmailAlreadyExistsError.create(data.email)
        }
        throw e
      }
    })
  }
}
