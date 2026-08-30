import { ROLE_ROUTES, ROLES, homeForRole } from '@/utils/role-routes'
import type { UserRole } from '@/services/auth.service'

describe('homeForRole', () => {
  it('returns the configured home for a valid role', () => {
    expect(homeForRole('DRIVER')).toBe('/(driver)/trip')
    expect(homeForRole('STUDENT')).toBe('/(student)/home')
    expect(homeForRole('ADMIN')).toBe('/(admin)/home')
  })

  it('returns null for an Object.prototype key instead of the inherited function', () => {
    for (const proto of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(homeForRole(proto as UserRole)).toBeNull()
    }
  })

  it('never throws on an unknown role', () => {
    expect(() => homeForRole('WHATEVER' as UserRole)).not.toThrow()
    expect(homeForRole('WHATEVER' as UserRole)).toBeNull()
  })
})

describe('ROLES x ROLE_ROUTES consistency', () => {
  it('covers every member of the UserRole union', () => {
    expect([...ROLES].sort()).toEqual(['ADMIN', 'DRIVER', 'STUDENT'])
  })

  it('gives every role a group and a home whose path starts with that group', () => {
    for (const role of ROLES) {
      const entry = ROLE_ROUTES[role]
      expect(entry.group).toMatch(/^\(.+\)$/)
      expect(typeof entry.home).toBe('string')
      expect(entry.home as string).toContain(`/${entry.group}/`)
      expect((entry.home as string).startsWith(`/${entry.group}/`)).toBe(true)
    }
  })
})
