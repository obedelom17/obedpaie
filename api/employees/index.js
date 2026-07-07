import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    if (req.method === 'GET') {
      const clientId = req.query?.client_id
      let query = `SELECT e.*, c.name as client_name FROM employees e JOIN clients c ON e.client_id = c.id WHERE c.organization_id = $1`
      const params = [auth.orgId]
      if (clientId) { query += ' AND e.client_id = $2'; params.push(clientId) }
      query += ' ORDER BY e.last_name'
      const result = await sql(query, params)
      return res.status(200).json(result.rows)
    }
    if (req.method === 'POST') {
      const b = req.body
      const result = await sql(
        `INSERT INTO employees (client_id, matricule, first_name, last_name, gender, birth_date, hire_date, position, category, marital_status, children_count, social_security_number, phone, email, active, status, contract_type, contract_end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [b.client_id, b.matricule||null, b.first_name, b.last_name, b.gender||'M', b.birth_date||null, b.hire_date||null, b.position||null, b.category||null, b.marital_status||'celibataire', b.children_count||0, b.social_security_number||null, b.phone||null, b.email||null, b.active!==false, b.status||'actif', b.contract_type||'cdi', b.contract_end_date||null]
      )
      return res.status(201).json(result.rows[0])
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
