import { createAuthClient } from '@neondatabase/auth'
import { BetterAuthVanillaAdapter } from '@neondatabase/auth/vanilla'

// Utilise le proxy Vercel (/api/neon-auth/*) pour que les cookies
// soient posés sur elompaie.vercel.app et transmis aux API serverless
const AUTH_URL = typeof window !== 'undefined'
  ? `${window.location.origin}/api/neon-auth`
  : (import.meta.env.VITE_NEON_AUTH_URL || '')

export const authClient = createAuthClient(AUTH_URL, {
  adapter: BetterAuthVanillaAdapter(),
})
