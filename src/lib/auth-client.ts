import { createAuthClient } from '@better-auth/client'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'https://elompaie.vercel.app',
})

export const { signIn, signUp, signOut, useSession } = authClient
