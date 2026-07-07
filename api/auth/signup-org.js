/**
 * POST /api/auth/signup-org
 * Crée user (via Neon Auth) + organisation liée
 */
import { getAuth } from '../_auth.js'
import { sql } from '../_db.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { email, password, orgName } = req.body
    if (!email || !password || !orgName)
      return res.status(400).json({ error: 'Champs requis manquants' })

    const auth = getAuth()

    // 1. Créer user via Neon Auth
    const { data, error } = await auth.signUp.email({
      email,
      password,
      name: email.split('@')[0],
    })
    if (error) return res.status(400).json({ error: error.message })

    const userId = data?.user?.id
    if (!userId) return res.status(500).json({ error: 'Création user échouée' })

    // 2. Créer organisation
    const orgRes = await sql(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
      [orgName.trim()]
    )
    const org = orgRes.rows[0]

    // 3. Lier user → org
    await sql('UPDATE "user" SET organization_id = $1 WHERE id = $2', [org.id, userId])

    return res.status(200).json({ ok: true, org })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
