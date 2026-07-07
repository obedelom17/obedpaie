import { sql } from '../_db.js'
import { requireAuth } from '../_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    const { id } = req.query
    if (req.method === 'GET') {
      const result = await sql(`SELECT e.*, c.name as client_name FROM employees e JOIN clients c ON e.client_id = c.id WHERE e.id = $1 AND c.organization_id = $2`, [id, auth.orgId])
      if (!result.rows.length) return res.status(404).json({ error: 'Employé introuvable' })
      return res.status(200).json(result.rows[0])
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const b = req.body
      const result = await sql(
        `UPDATE employees SET client_id=$1, matricule=$2, first_name=$3, last_name=$4, gender=$5, birth_date=$6, hire_date=$7, position=$8, category=$9, marital_status=$10, children_count=$11, social_security_number=$12, phone=$13, email=$14, active=$15, status=$16, contract_type=$17, contract_end_date=$18, updated_at=NOW()
         WHERE id=$19 RETURNING *`,
        [b.client_id, b.matricule||null, b.first_name, b.last_name, b.gender||'M', b.birth_date||null, b.hire_date||null, b.position||null, b.category||null, b.marital_status, b.children_count||0, b.social_security_number||null, b.phone||null, b.email||null, b.active!==false, b.status||'actif', b.contract_type||'cdi', b.contract_end_date||null, id]
      )
      return res.status(200).json(result.rows[0])
    }
    if (req.method === 'DELETE') {
      await sql('DELETE FROM employees WHERE id = $1', [id])
      return res.status(200).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e) { return res.status(500).json({ error: e.message }) }
}
