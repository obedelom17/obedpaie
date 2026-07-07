import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    const { id } = req.query
    if (req.method === 'GET') {
      const result = await sql(`SELECT pp.*, c.name as client_name, c.logo_url, c.num_employeur, c.nif, c.bp, c.phone as client_phone, c.entite_name FROM payroll_periods pp JOIN clients c ON pp.client_id = c.id WHERE pp.id = $1 AND c.organization_id = $2`, [id, auth.orgId])
      if (!result.rows.length) return res.status(404).json({ error: 'Période introuvable' })
      return res.status(200).json(result.rows[0])
    }
    if (req.method === 'PATCH') {
      const body = req.body
      const keys = Object.keys(body)
      const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ')
      const vals = [...Object.values(body), id]
      const result = await sql(`UPDATE payroll_periods SET ${sets}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals)
      return res.status(200).json(result.rows[0])
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
