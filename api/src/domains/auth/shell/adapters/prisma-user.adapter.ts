import { Injectable } from '@nestjs/common'
import { Effect } from 'effect'
import { PrismaService } from '../../../shared/shell/infra/prisma.service.js'
import type { UserRepository, UserData, CreateUserInput } from '../../core/ports/user-repository.port.js'

@Injectable()
export class PrismaUserAdapter implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Effect.Effect<UserData | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Effect.promise(() => (this.prisma as any).user.findUnique({ where: { email } }))
  }

  findById(id: string): Effect.Effect<UserData | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Effect.promise(() => (this.prisma as any).user.findUnique({ where: { id } }))
  }

  create(data: CreateUserInput): Effect.Effect<UserData> {
    return Effect.promise(async () => {
      // Transação atômica: cria Company + User no banco
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.prisma as any).$transaction(async (tx: any) => {
        const company = await tx.company.create({
          data: { name: data.companyName },
        })
        const user = await tx.user.create({
          data: {
            email: data.email,
            password: data.password,
            name: data.name,
            role: data.role,
            companyId: company.id,
          },
        })
        return {
          id: user.id,
          email: user.email,
          password: user.password,
          name: user.name,
          role: user.role as string,
          companyId: user.companyId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        } satisfies UserData
      })
    })
  }
}
