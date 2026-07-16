// Endpoint one-shot : crée l'org si manquante pour l'user connecté
export const config = { runtime: 'nodejs' }
import { neon } from '@neondatabase/serverless'

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL

export default async function handler(req, res) {
  try {
    const sessionRes = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
      headers: { cookie: req.headers?.cookie || '' },
      signal: AbortSignal.timeout(5000),
    })
    if (!sessionRes.ok) return res.status(401).json({ error: 'Non authentifié' })
    const session = await sessionRes.json()
    const userId = session?.user?.id
    const userEmail = session?.user?.email
    if (!userId) return res.status(401).json({ error: 'Session vide' })

    const { orgName } = req.body || {}
    const name = orgName || userEmail?.split('@')[0] || 'Cabinet'

    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)

    // Vérifier si déjà un profil
    const existing = await sql`SELECT up.organization_id, o.name FROM user_profiles up LEFT JOIN organizations o ON o.id = up.organization_id WHERE up.user_id = ${userId}`
    if (existing.length && existing[0].organization_id) {
      return res.status(200).json({ ok: true, org: { id: existing[0].organization_id, name: existing[0].name }, already: true })
    }

    // Créer org
    const orgs = await sql`INSERT INTO organizations (name) VALUES (${name}) RETURNING id::text, name`
    const org = orgs[0]

    // Lier user
    await sql`INSERT INTO user_profiles (user_id, organization_id) VALUES (${userId}, ${org.id}::uuid) ON CONFLICT (user_id) DO UPDATE SET organization_id = ${org.id}::uuid`

    return res.status(200).json({ ok: true, org })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
