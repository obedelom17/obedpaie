import { createAuthClient, BetterAuthVanillaAdapter } from '@neondatabase/auth'

const NEON_AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL

if (!NEON_AUTH_URL) {
  console.error('[auth] VITE_NEON_AUTH_URL manquant dans les variables d\'environnement')
}

export const authClient = createAuthClient(NEON_AUTH_URL, {
  adapter: BetterAuthVanillaAdapter(),
})
