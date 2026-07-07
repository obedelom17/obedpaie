import { requireAuth } from './_auth.js'
import { put } from '@vercel/blob'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    await requireAuth(req)

    // Récupérer le fichier depuis multipart
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    // Extraire Content-Type et nom depuis les headers
    const contentType = req.headers['x-content-type'] || 'image/png'
    const filename = req.headers['x-filename'] || `logo-${Date.now()}.png`

    const blob = await put(`logos/${filename}`, buffer, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ url: blob.url })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
