export const config = { runtime: 'nodejs' }

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL
const APP_URL = process.env.BETTER_AUTH_URL || 'https://elompaie.vercel.app'

export default async function handler(req, res) {
  if (!NEON_AUTH_BASE_URL) return res.status(500).json({ error: 'NEON_AUTH_BASE_URL non configuré' })

  // Vercel rewrite: /api/neon-auth/:path* → /api/neon-auth-proxy?_subpath=:path*
  const urlObj = new URL(req.url, 'http://x')
  const subpathRaw = urlObj.searchParams.get('_subpath') || ''
  const subpath = subpathRaw ? `/${subpathRaw}` : ''
  const targetUrl = `${NEON_AUTH_BASE_URL}${subpath}`

  // Parser le body (Vercel auto-parse JSON → req.body est déjà un objet)
  let body = undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    let parsed = {}
    try {
      parsed = req.body && typeof req.body === 'object'
        ? req.body
        : JSON.parse(req.body || '{}')
    } catch {}
    // Ne pas injecter callbackURL - cela force redirect:true et perturbe le SDK
    body = JSON.stringify(parsed)
  }

  const headers = {
    'origin':       APP_URL,
    'referer':      `${APP_URL}/`,
    'content-type': 'application/json',
  }
  if (req.headers['cookie'])        headers['cookie']        = req.headers['cookie']
  if (req.headers['authorization']) headers['authorization'] = req.headers['authorization']

  let upstreamRes
  try {
    upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    return res.status(502).json({ error: `Proxy network error: ${e.message}` })
  }

  // ── Réécrire les Set-Cookie ──────────────────────────────────────────────
  // Node 18+ fetch expose getSetCookie() pour gérer plusieurs cookies
  const rawCookies = typeof upstreamRes.headers.getSetCookie === 'function'
    ? upstreamRes.headers.getSetCookie()
    : [upstreamRes.headers.get('set-cookie')].filter(Boolean)

  const rewrittenCookies = rawCookies.map(cookie => {
    // 1. Supprimer Domain= (pour que le cookie s'applique à elompaie.vercel.app)
    cookie = cookie.replace(/;\s*Domain=[^;]*/gi, '')
    // 2. SameSite=Lax (None requiert Secure mais cause des pb cross-origin)
    cookie = cookie.replace(/SameSite=None/gi, 'SameSite=Lax')
    // 3. Forcer Path=/ pour que le cookie soit envoyé à TOUS les endpoints /api/*
    cookie = cookie.replace(/;\s*Path=[^;]*/gi, '')
    cookie = cookie + '; Path=/'
    return cookie
  })

  // ── Transmettre les autres headers ───────────────────────────────────────
  for (const [k, v] of upstreamRes.headers.entries()) {
    const lk = k.toLowerCase()
    if (['set-cookie','transfer-encoding','connection','content-encoding'].includes(lk)) continue
    try { res.setHeader(k, v) } catch {}
  }

  if (rewrittenCookies.length > 0) {
    res.setHeader('set-cookie', rewrittenCookies)
  }

  res.status(upstreamRes.status)
  res.send(await upstreamRes.text())
}
