/**
 * Vérifie la session Better Auth sur chaque requête API protégée.
 * Better Auth stocke la session dans un cookie (session_token) ou header Bearer.
 */
import { betterAuth } from 'better-auth'
import { Pool } from '@neondatabase/serverless'

let _auth = null

export function getAuth() {
  if (_auth) return _auth
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  _auth = betterAuth({
    database: { dialect: 'postgresql', db: pool },
    emailAndPassword: { enabled: true },
    trustedOrigins: [process.env.BETTER_AUTH_URL || 'https://elompaie.vercel.app'],
    secret: process.env.BETTER_AUTH_SECRET,
  })
  return _auth
}

export async function requireAuth(req) {
  const auth = getAuth()
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) throw new Error('Non authentifié')
  // Récupérer orgId depuis la table users
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
