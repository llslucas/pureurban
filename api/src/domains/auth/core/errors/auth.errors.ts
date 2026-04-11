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
