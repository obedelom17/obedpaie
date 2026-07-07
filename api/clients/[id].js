import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    const { id } = req.query
    if (req.method === 'GET') {
      const result = await sql('SELECT * FROM clients WHERE id = $1 AND organization_id = $2', [id, auth.orgId])
      if (!result.rows.length) return res.status(404).json({ error: 'Client introuvable' })
      return res.status(200).json(result.rows[0])
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const b = req.body
      const result = await sql(
        `UPDATE clients SET name=$1, address=$2, phone=$3, email=$4, ifu=$5, rccm=$6, sector=$7, num_employeur=$8, nif=$9, bp=$10, entite_name=$11, logo_url=$12, updated_at=NOW()
         WHERE id=$13 AND organization_id=$14 RETURNING *`,
        [b.name, b.address||null, b.phone||null, b.email||null, b.ifu||null, b.rccm||null, b.sector||null, b.num_employeur||null, b.nif||null, b.bp||null, b.entite_name||null, b.logo_url||null, id, auth.orgId]
      )
      return res.status(200).json(result.rows[0])
    }
    if (req.method === 'DELETE') {
      await sql('DELETE FROM clients WHERE id = $1 AND organization_id = $2', [id, auth.orgId])
      return res.status(200).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
