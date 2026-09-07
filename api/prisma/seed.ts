/**
 * Prisma Seed — PureUrban (dev-only)
 *
 * Populates the database with an initial Company and Admin user for development.
 *
 * Usage (requires Docker DB running and api/.env — copy .env.example if missing):
 *   docker compose up -d
 *   npx prisma migrate dev
 *   npx prisma generate
 *   npm run seed
 *
 * Idempotent: skips when the seed data already exists.
 */

import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import * as bcrypt from 'bcrypt'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set — copy api/.env.example to api/.env')
  process.exit(1)
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

const SALT_ROUNDS = 12

async function main() {
  console.log('🌱 Seeding database...')

  // Check if seed data already exists
  const existing = await prisma.company.findFirst({
    where: { name: 'PureUrban Dev' },
  })

  if (existing) {
    console.log('⚠️  Seed data already exists. Skipping.')
    return
  }

  // Create initial Company + Admin user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: 'PureUrban Dev' },
    })

    const hashedPassword = await bcrypt.hash('admin123456', SALT_ROUNDS)

    const user = await tx.user.create({
      data: {
        name: 'Admin PureUrban',
        email: 'admin@pureurban.dev',
        password: hashedPassword,
        role: 'ADMIN',
        companyId: company.id,
      },
    })

    return { company, user }
  })

  console.log('✅ Seed complete!')
  console.log(`   Company: ${result.company.name} (id: ${result.company.id})`)
  console.log(`   Admin:   ${result.user.email} (id: ${result.user.id})`)
  console.log('')
  console.log('⚠️  Change the admin password after first login!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
