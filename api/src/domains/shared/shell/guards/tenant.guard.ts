import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user) {
      throw new UnauthorizedException({
        code: 'MISSING_TENANT',
        message: 'Authentication required: no user found in request',
      })
    }

    if (!user.companyId) {
      throw new UnauthorizedException({
        code: 'MISSING_TENANT',
        message: 'JWT does not contain companyId',
      })
    }

    request.tenantId = user.companyId
    return true
  }
}
