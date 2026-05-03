import { Data } from 'effect'

export class EmailAlreadyExistsError extends Data.TaggedError('EmailAlreadyExistsError')<{
  readonly code: string
  readonly message: string
  readonly httpStatus: number
}> {
  static readonly create = (email: string) =>
    new EmailAlreadyExistsError({
      code: 'EMAIL_ALREADY_EXISTS',
      message: `Email ${email} já está em uso`,
      httpStatus: 409,
    })
}

export class InvalidCredentialsError extends Data.TaggedError('InvalidCredentialsError')<{
  readonly code: string
  readonly message: string
  readonly httpStatus: number
}> {
  static readonly create = () =>
    new InvalidCredentialsError({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas',
      httpStatus: 401,
    })
}

export class InvalidRefreshTokenError extends Data.TaggedError('InvalidRefreshTokenError')<{
  readonly code: string
  readonly message: string
  readonly httpStatus: number
}> {
  static readonly create = () =>
    new InvalidRefreshTokenError({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token inválido ou expirado',
      httpStatus: 401,
    })
}

export class DriverNotFoundError extends Data.TaggedError('DriverNotFoundError')<{
  readonly code: string
  readonly message: string
  readonly httpStatus: number
}> {
  static readonly create = (id?: string) =>
    new DriverNotFoundError({
      code: 'DRIVER_NOT_FOUND',
      message: id ? `Motorista ${id} não encontrado` : 'Motorista não encontrado',
      httpStatus: 404,
    })
}
