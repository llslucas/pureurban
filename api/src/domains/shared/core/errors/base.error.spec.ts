import { describe, it, expect } from 'vitest';
import {
  DomainError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from './base.error.js';

describe('DomainError e erros derivados', () => {
  describe('DomainError', () => {
    it('deve construir com propriedades obrigatórias', () => {
      const error = new DomainError({
        code: 'SOME_ERROR',
        message: 'Something went wrong',
        httpStatus: 500,
      });

      expect(error.code).toBe('SOME_ERROR');
      expect(error.message).toBe('Something went wrong');
      expect(error.httpStatus).toBe(500);
      expect(error._tag).toBe('DomainError');
    });

    it('deve aceitar details opcionais', () => {
      const error = new DomainError({
        code: 'SOME_ERROR',
        message: 'Something went wrong',
        httpStatus: 500,
        details: { field: 'value' },
      });

      expect(error.details).toEqual({ field: 'value' });
    });

    it('deve ter _tag = "DomainError"', () => {
      const error = new DomainError({
        code: 'SOME_ERROR',
        message: 'Something',
        httpStatus: 500,
      });
      expect(error._tag).toBe('DomainError');
    });
  });

  describe('NotFoundError', () => {
    it('deve ter httpStatus = 404', () => {
      const error = new NotFoundError({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });

      expect(error.httpStatus).toBe(404);
      expect(error.code).toBe('STUDENT_NOT_FOUND');
      expect(error._tag).toBe('NotFoundError');
    });
  });

  describe('ForbiddenError', () => {
    it('deve ter httpStatus = 403', () => {
      const error = new ForbiddenError({
        code: 'FORBIDDEN',
        message: 'Forbidden',
      });

      expect(error.httpStatus).toBe(403);
      expect(error._tag).toBe('ForbiddenError');
    });
  });

  describe('ConflictError', () => {
    it('deve ter httpStatus = 409', () => {
      const error = new ConflictError({
        code: 'DRIVER_ALREADY_EXISTS',
        message: 'Driver already exists',
      });

      expect(error.httpStatus).toBe(409);
      expect(error._tag).toBe('ConflictError');
    });
  });

  describe('ValidationError', () => {
    it('deve ter httpStatus = 400', () => {
      const error = new ValidationError({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { issues: [] },
      });

      expect(error.httpStatus).toBe(400);
      expect(error._tag).toBe('ValidationError');
    });
  });
});
