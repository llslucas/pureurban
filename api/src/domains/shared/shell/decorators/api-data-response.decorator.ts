import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Documenta o envelope real { data: T, meta: { timestamp } } produzido pelo
 * ResponseWrapperInterceptor global — sem isso o openapi.json declara só o
 * DTO interno e os tipos gerados no mobile mentem sobre o wire format.
 */
export const ApiDataResponse = <T extends Type<unknown>>(
  model: T,
  status = 200,
  description = 'Sucesso',
) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description,
      schema: {
        properties: {
          data: { $ref: getSchemaPath(model) },
          meta: {
            type: 'object',
            properties: { timestamp: { type: 'string', format: 'date-time' } },
          },
        },
        required: ['data', 'meta'],
      },
    }),
  );
