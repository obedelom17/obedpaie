/**
 * Neon Auth (Better Auth) — catch-all handler
 * Gère : POST /api/auth/sign-in/email
 *         POST /api/auth/sign-up/email
 *         POST /api/auth/sign-out
 *         GET  /api/auth/get-session
 */
import { betterAuth } from 'better-auth'
import { Pool } from '@neondatabase/serverless'

let _auth = null

function getAuth() {
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

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  const auth = getAuth()
  return auth.handler(req, res)
}
