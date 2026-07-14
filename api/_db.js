import { neon } from '@neondatabase/serverless'

function getSql() {
  return neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
}

export async function sql(query, params = []) {
  const db = getSql()
  const rows = await db(query, params)
  return { rows: Array.isArray(rows) ? rows : [], rowCount: rows?.length || 0 }
}
