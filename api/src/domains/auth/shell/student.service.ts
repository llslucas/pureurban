import { Injectable, Inject } from '@nestjs/common';
import type { ManagedRuntime } from 'effect';
import { EffectEventDispatcher } from '../../shared/shell/effect-runtime/event-dispatcher.service.js';
import { createStudent } from '../core/use-cases/create-student.use-case.js';
import { listStudents } from '../core/use-cases/list-students.use-case.js';
import { getStudent } from '../core/use-cases/get-student.use-case.js';
import { updateStudent } from '../core/use-cases/update-student.use-case.js';
import { deactivateStudent } from '../core/use-cases/deactivate-student.use-case.js';
import type { CreateStudentInput } from '../core/schemas/create-student.schema.js';
import type { UpdateStudentInput } from '../core/schemas/update-student.schema.js';

export const STUDENT_RUNTIME = 'STUDENT_RUNTIME';

@Injectable()
export class StudentService {
  constructor(
    @Inject(STUDENT_RUNTIME)
    private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
    private readonly eventDispatcher: EffectEventDispatcher,
  ) {}

  async create(input: CreateStudentInput, companyId: string) {
    const user = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      createStudent(input, companyId),
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async list(companyId: string, isActive?: boolean) {
    const users = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      listStudents({ companyId, isActive }),
    );
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  async getById(id: string, companyId: string) {
    const user = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      getStudent({ id, companyId }),
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async update(id: string, companyId: string, data: UpdateStudentInput) {
    const user = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      updateStudent({ id, companyId, data }),
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async deactivate(id: string, companyId: string) {
    const user = await this.eventDispatcher.runAndDispatch(
      this.runtime,
      deactivateStudent({ id, companyId }),
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
