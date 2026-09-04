/**
 * Factory index — re-exports all data factories.
 *
 * Import from here for convenience:
 * import { createUser, createCompany } from '../support/factories';
 */
export { createCompany, createCompanies, type Company } from './company.factory';
export {
  createUser,
  createAdmin,
  createDriver,
  createStudent,
  createUsers,
  type User,
  type UserRole,
} from './user.factory';
export { createRouteInput, type RouteInput } from './route.factory';
export { createPersonInput, type PersonInput } from './student.factory';
