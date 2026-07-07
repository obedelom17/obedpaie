import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    if (req.method === 'GET') {
      const result = await sql('SELECT * FROM activity_logs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100', [auth.orgId])
      return res.status(200).json(result.rows)
    }
    if (req.method === 'POST') {
      const { action, details } = req.body
      await sql('INSERT INTO activity_logs (organization_id, user_id, action, details) VALUES ($1,$2,$3,$4)', [auth.orgId, auth.userId, action, details||null])
      return res.status(201).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
