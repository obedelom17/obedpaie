/**
 * Neon Auth — catch-all handler
 * Gère toutes les routes /api/auth/* (sign-in, sign-up, sign-out, get-session, etc.)
 */
import { getAuth } from '../_auth.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  const auth = getAuth()
  const { GET, POST } = auth.handler()
  if (req.method === 'GET') return GET(req, res)
  if (req.method === 'POST') return POST(req, res)
  return res.status(405).end()
}
