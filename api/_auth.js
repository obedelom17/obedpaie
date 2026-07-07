/**
 * Neon Auth — session helper pour les routes API protégées.
 * Utilise @neondatabase/auth (SDK natif Neon, propulsé par Better Auth).
 */
import { createNeonAuth } from '@neondatabase/auth/next/server'

let _auth = null

export function getAuth() {
  if (_auth) return _auth
  _auth = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET },
  })
  return _auth
}

export async function requireAuth(req) {
  const auth = getAuth()
  const session = await auth.getSession({ headers: req.headers })
  if (!session?.user) throw new Error('Non authentifié')

  const { sql } = await import('./_db.js')
  const res = await sql(
    'SELECT u.organization_id, o.name as org_name FROM "user" u JOIN organizations o ON u.organization_id = o.id WHERE u.id = $1',
    [session.user.id]
  )
  if (!res.rows.length) throw new Error('Utilisateur sans organisation')
  return {
    userId: session.user.id,
    email: session.user.email,
    orgId: res.rows[0].organization_id,
    orgName: res.rows[0].org_name,
  }
}
