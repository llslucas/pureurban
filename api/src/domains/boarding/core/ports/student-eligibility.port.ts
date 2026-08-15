import { Context, Effect } from 'effect';

export interface StudentEligibilityApi {
  // true somente se: user existe, role STUDENT, isActive, mesma company, vinculado à rota
  isAllowedOnRoute(
    studentId: string,
    routeId: string,
    companyId: string,
  ): Effect.Effect<boolean>;
}

export class StudentEligibility extends Context.Tag('StudentEligibility')<
  StudentEligibility,
  StudentEligibilityApi
>() {}
