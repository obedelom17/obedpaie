import { sql } from './_db.js'
import { requireAuth } from './_auth.js'
export const config = { runtime: 'nodejs' }
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req)
    const id = req.query?.id
    if (id) {
      if (req.method === 'GET') {
        const r = await sql('SELECT * FROM clients WHERE id=$1 AND organization_id=$2', [id, auth.orgId])
        if (!r.rows.length) return res.status(404).json({ error: 'Client introuvable' })
        return res.status(200).json(r.rows[0])
      }
      if (req.method === 'PUT' || req.method === 'PATCH') {
        const b = req.body
        const r = await sql(
          `UPDATE clients SET name=$1,address=$2,phone=$3,email=$4,ifu=$5,rccm=$6,sector=$7,num_employeur=$8,nif=$9,bp=$10,entite_name=$11,logo_url=$12,updated_at=NOW() WHERE id=$13 AND organization_id=$14 RETURNING *`,
          [b.name,b.address||null,b.phone||null,b.email||null,b.ifu||null,b.rccm||null,b.sector||null,b.num_employeur||null,b.nif||null,b.bp||null,b.entite_name||null,b.logo_url||null,id,auth.orgId]
        )
        return res.status(200).json(r.rows[0])
      }
      if (req.method === 'DELETE') {
        await sql('DELETE FROM clients WHERE id=$1 AND organization_id=$2', [id, auth.orgId])
        return res.status(200).json({ ok: true })
      }
    } else {
      if (req.method === 'GET') {
        const r = await sql('SELECT * FROM clients WHERE organization_id=$1 ORDER BY name', [auth.orgId])
        return res.status(200).json(r.rows)
      }
      if (req.method === 'POST') {
        const b = req.body
        const r = await sql(
          `INSERT INTO clients (organization_id,name,address,phone,email,ifu,rccm,sector,num_employeur,nif,bp,entite_name,logo_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [auth.orgId,b.name,b.address||null,b.phone||null,b.email||null,b.ifu||null,b.rccm||null,b.sector||null,b.num_employeur||null,b.nif||null,b.bp||null,b.entite_name||null,b.logo_url||null]
        )
        return res.status(201).json(r.rows[0])
      }
    }
    return res.status(405).end()
  } catch (e) { 
    const status = e.message.includes('auth') || e.message.includes('authentif') ? 401 : 500
    return res.status(status).json({ error: e.message }) 
  }
}
