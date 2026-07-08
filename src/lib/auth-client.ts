import { createInternalNeonAuth } from '@neondatabase/auth'

// createInternalNeonAuth expose à la fois adapter (signIn/signUp/etc.) ET getJWTToken()
export const neonAuth = createInternalNeonAuth(import.meta.env.VITE_NEON_AUTH_URL)

// adapter = API Better Auth (signIn.email, signUp.email, getSession, signOut)
export const authClient = neonAuth.adapter

// getJWTToken() retourne le JWT signé pour les appels API
export const getJWTToken = () => neonAuth.getJWTToken()
