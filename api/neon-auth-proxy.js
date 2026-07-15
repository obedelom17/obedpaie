// Proxy toutes les requêtes Neon Auth via Vercel pour que les cookies
// soient sur elompaie.vercel.app et non sur le domaine Neon Auth
export const config = { runtime: 'nodejs' }

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL

export default async function handler(req, res) {
  if (!NEON_AUTH_BASE_URL) return res.status(500).json({ error: 'NEON_AUTH_BASE_URL non configuré' })

  // Extraire le sous-chemin après /api/neon-auth/
  const subpath = req.url.replace(/^\/api\/neon-auth/, '')

  const url = `${NEON_AUTH_BASE_URL}${subpath}`

  const headers = {}
  // Transmettre les headers pertinents
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
  if (req.headers['cookie']) headers['cookie'] = req.headers['cookie']
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization']

  const upstreamRes = await fetch(url, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    signal: AbortSignal.timeout(10000),
  })

  // Transmettre les headers de réponse, surtout Set-Cookie
  for (const [key, value] of upstreamRes.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      // Réécrire le cookie pour qu'il soit sur notre domaine
      const rewritten = value
        .replace(/Domain=[^;]+;?\s*/gi, '')  // supprimer Domain= original
        .replace(/SameSite=None/gi, 'SameSite=Lax') // forcer SameSite=Lax
      res.setHeader('set-cookie', rewritten)
    } else if (!['transfer-encoding', 'connection'].includes(key.toLowerCase())) {
      res.setHeader(key, value)
    }
  }

  res.status(upstreamRes.status)
  const body = await upstreamRes.text()
  res.send(body)
}
