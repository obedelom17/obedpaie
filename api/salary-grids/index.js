import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req) {
  try {
    const auth = await requireAuth(req)
    if (req.method === 'GET') {
      const res = await sql(`SELECT sg.*, c.name as client_name FROM salary_grids sg JOIN clients c ON sg.client_id = c.id WHERE c.organization_id = $1 ORDER BY sg.category, sg.echelon`, [auth.orgId])
      return new Response(JSON.stringify(res.rows), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (req.method === 'POST') {
      const b = await req.json()
      const res = await sql('INSERT INTO salary_grids (client_id, category, echelon, base_salary, hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING *', [b.client_id, b.category, b.echelon||1, b.base_salary||0, b.hourly_rate||0])
      return new Response(JSON.stringify(res.rows[0]), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('Method Not Allowed', { status: 405 })
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }) }
}
