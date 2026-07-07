import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    await requireAuth(req)
    const { period_id, employee_id } = req.query
    if (req.method === 'GET') {
      let query = `SELECT pv.*, e.first_name, e.last_name, e.matricule, e.position, e.category, e.marital_status, e.children_count FROM payroll_variables pv JOIN employees e ON pv.employee_id = e.id WHERE pv.period_id = $1`
      const params = [period_id]
      if (employee_id) { query += ' AND pv.employee_id = $2'; params.push(employee_id) }
      const result = await sql(query, params)
      return res.status(200).json(result.rows)
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const b = req.body
      const existing = await sql('SELECT id FROM payroll_variables WHERE period_id=$1 AND employee_id=$2', [b.period_id, b.employee_id])
      let result
      if (existing.rows.length) {
        const { period_id: _p, employee_id: _e, ...rest } = b
        const keys = Object.keys(rest)
        const sets = keys.map((k, i) => `${k}=$${i+1}`).join(', ')
        result = await sql(`UPDATE payroll_variables SET ${sets}, updated_at=NOW() WHERE id=$${keys.length+1} RETURNING *`, [...Object.values(rest), existing.rows[0].id])
      } else {
        const keys = Object.keys(b)
        result = await sql(`INSERT INTO payroll_variables (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, Object.values(b))
      }
      return res.status(200).json(result.rows[0])
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
