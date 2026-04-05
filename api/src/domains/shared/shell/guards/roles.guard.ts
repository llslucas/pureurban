import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Roles } from '../decorators/roles.decorator.js'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get(Roles, context.getHandler())
    if (!requiredRoles || requiredRoles.length === 0) return true // sem @Roles() = público

    const request = context.switchToHttp().getRequest()
    const user = request.user
    const userRole: unknown = user?.role

    if (typeof userRole !== 'string' || !requiredRoles.some((r: string) => r === userRole)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this resource',
      })
    }

    return true
  }
}
