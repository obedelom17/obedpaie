import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, { params }) {
  try {
    await requireAuth(req)
    const id = params?.id || req.url.split('/').pop().split('?')[0]
    if (req.method === 'PUT') {
      const b = await req.json()
      const res = await sql('UPDATE salary_grids SET category=$1, echelon=$2, base_salary=$3, hourly_rate=$4 WHERE id=$5 RETURNING *', [b.category, b.echelon, b.base_salary, b.hourly_rate, id])
      return new Response(JSON.stringify(res.rows[0]), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (req.method === 'DELETE') {
      await sql('DELETE FROM salary_grids WHERE id=$1', [id])
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('Method Not Allowed', { status: 405 })
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500 }) }
}
