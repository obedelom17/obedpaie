import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    if (req.method === 'GET') {
      const clientId = req.query?.client_id
      let query = `SELECT pp.*, c.name as client_name FROM payroll_periods pp JOIN clients c ON pp.client_id = c.id WHERE c.organization_id = $1`
      const params = [auth.orgId]
      if (clientId) { query += ' AND pp.client_id = $2'; params.push(clientId) }
      query += ' ORDER BY pp.period_year DESC, pp.period_month DESC'
      const result = await sql(query, params)
      return res.status(200).json(result.rows)
    }
    if (req.method === 'POST') {
      const { client_id, period_month, period_year } = req.body
      const existing = await sql('SELECT id FROM payroll_periods WHERE client_id=$1 AND period_year=$2 AND period_month=$3', [client_id, period_year, period_month])
      if (existing.rows.length) return res.status(409).json({ error: 'Période déjà existante' })
      const result = await sql('INSERT INTO payroll_periods (client_id, period_month, period_year, status) VALUES ($1,$2,$3,$4) RETURNING *', [client_id, period_month, period_year, 'open'])
      return res.status(201).json(result.rows[0])
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
