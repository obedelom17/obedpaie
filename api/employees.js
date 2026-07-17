import { sql } from './_db.js'
import { requireAuth } from './_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    if (!auth.orgId) return res.status(403).json({ error: 'Aucune organisation liée à ce compte' })
    const id = req.query?.id
    if (id) {
      if (req.method === 'GET') {
        const r = await sql(`SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON e.client_id=c.id WHERE e.id=$1 AND c.organization_id=$2`, [id, auth.orgId])
        if (!r.rows.length) return res.status(404).json({ error: 'Employé introuvable' })
        return res.status(200).json(r.rows[0])
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const b = req.body
        const r = await sql(
          `UPDATE employees SET client_id=$1,matricule=$2,first_name=$3,last_name=$4,gender=$5,birth_date=$6,hire_date=$7,position=$8,category=$9,marital_status=$10,children_count=$11,social_security_number=$12,phone=$13,email=$14,active=$15,status=$16,contract_type=$17,contract_end_date=$18,pole=$19,responsable=$20,updated_at=NOW() WHERE id=$21 RETURNING *`,
          [b.client_id,b.matricule||null,b.first_name,b.last_name,b.gender||'M',b.birth_date||null,b.hire_date||null,b.position||null,b.category||null,b.marital_status,b.children_count||0,b.social_security_number||null,b.phone||null,b.email||null,b.active!==false,b.status||'actif',b.contract_type||'cdi',b.contract_end_date||null,b.pole||null,b.responsable||null,id]
        )
        return res.status(200).json(r.rows[0])
      }
      if (req.method === 'DELETE') {
        await sql('DELETE FROM employees WHERE id=$1', [id])
        return res.status(200).json({ ok: true })
      }
    } else {
      if (req.method === 'GET') {
        const clientId = req.query?.client_id
        let q = `SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON e.client_id=c.id WHERE c.organization_id=$1`
        const p = [auth.orgId]
        if (clientId) { q += ' AND e.client_id=$2'; p.push(clientId) }
        q += ' ORDER BY e.last_name'
        const r = await sql(q, p)
        return res.status(200).json(r.rows)
      }
      if (req.method === 'POST') {
        const b = req.body
        const r = await sql(
          `INSERT INTO employees (client_id,matricule,first_name,last_name,gender,birth_date,hire_date,position,category,marital_status,children_count,social_security_number,phone,email,active,status,contract_type,contract_end_date,pole,responsable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
          [b.client_id,b.matricule||null,b.first_name,b.last_name,b.gender||'M',b.birth_date||null,b.hire_date||null,b.position||null,b.category||null,b.marital_status||'celibataire',b.children_count||0,b.social_security_number||null,b.phone||null,b.email||null,b.active!==false,b.status||'actif',b.contract_type||'cdi',b.contract_end_date||null,b.pole||null,b.responsable||null]
        )
        return res.status(201).json(r.rows[0])
      }
    }
    return res.status(405).end()
  } catch (e) {
    const status = e.message.includes('auth')||e.message.includes('authentif')||e.message.includes('Session') ? 401 : 500
    return res.status(status).json({ error: e.message })
  }
}
