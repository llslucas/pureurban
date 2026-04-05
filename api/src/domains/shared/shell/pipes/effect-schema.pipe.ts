import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common'
import { Schema, ArrayFormatter } from '@effect/schema'

@Injectable()
export class EffectSchemaPipe<A, I> implements PipeTransform {
  constructor(private readonly schema: Schema.Schema<A, I>) {}

  transform(value: I): A {
    const result = Schema.decodeUnknownEither(this.schema)(value)
    if (result._tag === 'Left') {
      const issues = this.formatIssues(result.left)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { issues },
      })
    }
    return result.right
  }

  private formatIssues(error: unknown): Array<{ path: string; message: string }> {
    try {
      if (ArrayFormatter?.formatErrorSync) {
        return ArrayFormatter.formatErrorSync(error as Parameters<typeof ArrayFormatter.formatErrorSync>[0]).map(
          (issue: { path: ReadonlyArray<PropertyKey>; message: string }) => ({
            path: issue.path.join('.'),
            message: issue.message,
          }),
        )
      }
    } catch {
      // Fallback silencioso
    }
    return [{ path: '', message: String(error) }]
  }
}
