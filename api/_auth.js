/**
 * Neon Auth (Better Auth) — vérification session via API
 * Les tokens sont opaques (pas des JWT), validés via /get-session
 */
import { sql } from './_db.js'

export async function requireAuth(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Non authentifié')

  const token = authHeader.slice(7)
  const baseUrl = process.env.NEON_AUTH_BASE_URL

  // Valider le session token via Neon Auth API
  const sessionRes = await fetch(`${baseUrl}/get-session`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!sessionRes.ok) throw new Error('Non authentifié')
  const session = await sessionRes.json()

  const userId = session?.user?.id
  if (!userId) throw new Error('Session invalide')

  // Récupérer org depuis notre DB
  const res = await sql(
    `SELECT u.id, u.email, u.organization_id, o.name as org_name
     FROM neon_auth.users_sync u
     LEFT JOIN organizations o ON u.organization_id = o.id
     WHERE u.id = $1`,
    [userId]
  )

  if (!res.rows.length) {
    return { userId, email: session.user.email, orgId: null, orgName: null }
  }

  const row = res.rows[0]
  return {
    userId: row.id,
    email: row.email,
    orgId: row.organization_id,
    orgName: row.org_name,
  }
}
