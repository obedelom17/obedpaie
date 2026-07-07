import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    if (req.method === 'GET') {
      const result = await sql('SELECT * FROM clients WHERE organization_id = $1 ORDER BY name', [auth.orgId])
      return res.status(200).json(result.rows)
    }
    if (req.method === 'POST') {
      const b = req.body
      const result = await sql(
        `INSERT INTO clients (organization_id, name, address, phone, email, ifu, rccm, sector, num_employeur, nif, bp, entite_name, logo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [auth.orgId, b.name, b.address||null, b.phone||null, b.email||null, b.ifu||null, b.rccm||null, b.sector||null, b.num_employeur||null, b.nif||null, b.bp||null, b.entite_name||null, b.logo_url||null]
      )
      return res.status(201).json(result.rows[0])
    }
    return res.status(405).end()
  } catch (e) { return res.status(e.message.includes('auth') ? 401 : 500).json({ error: e.message }) }
}
