import { createRemoteJWKSet, jwtVerify } from 'jose'
import { neon } from '@neondatabase/serverless'

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL
const SESSION_COOKIE = '__Secure-neonauth.session_token'
const SESSION_COOKIE_DEV = 'neonauth.session_token'

let _jwks = null
function getJWKS() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`${NEON_AUTH_BASE_URL}/.well-known/jwks.json`))
  }
  return _jwks
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k.trim(), decodeURIComponent(v.join('='))]
    })
  )
}

export async function requireAuth(req) {
  const cookies = parseCookies(req.headers?.cookie || '')
  const token = cookies[SESSION_COOKIE] || cookies[SESSION_COOKIE_DEV]
  if (!token) throw new Error('Non authentifié')

  let payload
  try {
    const result = await jwtVerify(token, getJWKS())
    payload = result.payload
  } catch {
    throw new Error('Session invalide')
  }

  const userId = payload.sub
  if (!userId) throw new Error('Session invalide')

  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)

  // Neon Auth stocke les users dans neon_auth.users_sync
  // organization_id est dans notre table user_profiles (ou on rejoint organizations via une table pivot)
  const rows = await sql`
    SELECT up.organization_id, o.name as org_name, nu.email
    FROM neon_auth.users_sync nu
    LEFT JOIN user_profiles up ON up.user_id = nu.id
    LEFT JOIN organizations o ON o.id::text = up.organization_id
    WHERE nu.id = ${userId}
  `

  const row = rows[0]
  return {
    userId,
    email: row?.email || payload.email || '',
    orgId: row?.organization_id || null,
    orgName: row?.org_name || null,
  }
}
