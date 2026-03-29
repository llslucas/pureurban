/**
 * Auth provider para PureUrban (JWT).
 *
 * Implementação futura — usado quando @seontechnologies/playwright-utils
 * estiver instalado e testes autenticados forem necessários.
 *
 * @see knowledge/auth-session.md
 */
// import { type AuthProvider } from '@seontechnologies/playwright-utils/auth-session';

export interface AuthProviderOptions {
  environment?: string;
  userIdentifier?: string;
}

/**
 * Provider JWT para PureUrban.
 * Login via POST /api/v1/auth/login, persistência de token em disco.
 *
 * TODO: Implementar quando Story 2.2 (Autenticação) estiver completa.
 */
// const pureUrbanAuthProvider: AuthProvider = {
//   getEnvironment: (options) => options.environment || 'local',
//   getUserIdentifier: (options) => options.userIdentifier || 'admin',
//
//   extractToken: (storageState) => {
//     const tokenEntry = storageState.origins?.[0]?.localStorage?.find(
//       (item) => item.name === 'auth_token',
//     );
//     return tokenEntry?.value;
//   },
//
//   isTokenExpired: (storageState) => {
//     const expiryEntry = storageState.origins?.[0]?.localStorage?.find(
//       (item) => item.name === 'token_expiry',
//     );
//     if (!expiryEntry) return true;
//     return Date.now() > parseInt(expiryEntry.value, 10);
//   },
//
//   manageAuthToken: async (request, options) => {
//     const email = process.env.TEST_USER_EMAIL;
//     const password = process.env.TEST_USER_PASSWORD;
//
//     if (!email || !password) {
//       throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set');
//     }
//
//     const response = await request.post('/api/v1/auth/login', {
//       data: { email, password },
//     });
//
//     if (!response.ok()) {
//       throw new Error(`Auth failed: ${response.status()}`);
//     }
//
//     const { accessToken, expiresIn } = await response.json();
//     const expiryTime = Date.now() + expiresIn * 1000;
//
//     return {
//       cookies: [],
//       origins: [
//         {
//           origin: process.env.BASE_URL || 'http://localhost:3000',
//           localStorage: [
//             { name: 'auth_token', value: accessToken },
//             { name: 'token_expiry', value: String(expiryTime) },
//           ],
//         },
//       ],
//     };
//   },
// };
//
// export default pureUrbanAuthProvider;
