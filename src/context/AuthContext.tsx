import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authClient } from '../lib/auth-client'

interface OrgInfo { id: string; name: string }
interface UserInfo { id: string; email: string; name?: string }
interface AuthContextType {
  user: UserInfo | null
  org: OrgInfo | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, orgName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshOrg: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchMe(): Promise<{ user: UserInfo | null; org: OrgInfo | null }> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return { user: null, org: null }
    const data = await res.json()
    return {
      user: data.userId ? { id: data.userId, email: data.email } : null,
      org: data.org || null,
    }
  } catch { return { user: null, org: null } }
}

async function fetchMeWithRetry(attempts = 6): Promise<{ user: UserInfo | null; org: OrgInfo | null }> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(500 * i)
    const me = await fetchMe()
    if (me.user) return me
  }
  return { user: null, org: null }
}

async function ensureOrg(orgName?: string): Promise<OrgInfo | null> {
  for (let i = 0; i < 5; i++) {
    if (i > 0) await sleep(800 * i)
    try {
      const res = await fetch('/api/auth/repair-org', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName: orgName || '' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.org) return data.org
      }
    } catch {}
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshOrg = async () => {
    const me = await fetchMe()
    if (me.org) setOrg(me.org)
    else {
      const fixed = await ensureOrg()
      if (fixed) setOrg(fixed)
    }
  }

  // Chargement initial : vérifier si session existe déjà
  useEffect(() => {
    ;(async () => {
      try {
        const me = await fetchMe()
        if (me.user) {
          setUser(me.user)
          if (me.org) {
            setOrg(me.org)
          } else {
            const fixed = await ensureOrg()
            if (fixed) setOrg(fixed)
          }
        }
      } catch {}
      setLoading(false)
    })()
  }, [])

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      // 1. Appel signIn via proxy Neon Auth (pose le cookie)
      const result = await (authClient as any).signIn.email({ email, password })
      const { data, error } = result || {}

      if (error) {
        const msg = error.message || ''
        if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials') || msg.toLowerCase().includes('password')) {
          return { error: 'Email ou mot de passe incorrect.' }
        }
        return { error: msg || 'Erreur de connexion.' }
      }

      // 2. Attendre que le cookie soit disponible et vérifier session
      await sleep(400)
      const me = await fetchMeWithRetry(6)

      if (me.user) {
        setUser(me.user)
        if (me.org) {
          setOrg(me.org)
        } else {
          const fixed = await ensureOrg()
          if (fixed) setOrg(fixed)
        }
        return { error: null }
      }

      // 3. Fallback: si fetchMe échoue mais signIn a réussi, utiliser data.user
      if (data?.user?.id) {
        setUser({ id: data.user.id, email: data.user.email || email })
        const fixed = await ensureOrg()
        if (fixed) setOrg(fixed)
        return { error: null }
      }

      // 4. signIn a réussi mais on ne peut pas vérifier la session
      // Forcer avec l'email connu
      setUser({ id: 'pending', email })
      return { error: null }

    } catch (e: any) {
      return { error: e.message || 'Erreur de connexion.' }
    }
  }

  const signUp = async (email: string, password: string, orgName: string): Promise<{ error: string | null }> => {
    try {
      // 1. Inscription
      const { data: signUpData, error: signUpError } = await (authClient as any).signUp.email({
        email, password, name: orgName,
      }) || {}
      if (signUpError) return { error: signUpError.message || 'Erreur inscription.' }

      // 2. Connexion automatique
      await sleep(300)
      const { data, error: signInError } = await (authClient as any).signIn.email({ email, password }) || {}
      if (signInError) return { error: signInError.message || 'Inscription réussie. Connectez-vous.' }

      // 3. Vérifier session
      await sleep(500)
      const me = await fetchMeWithRetry(5)
      const userId = me.user?.id || data?.user?.id || signUpData?.user?.id
      const userEmail = me.user?.email || data?.user?.email || email

      if (userId) setUser({ id: userId, email: userEmail })
      else setUser({ id: 'pending', email })

      // 4. Créer organisation
      const newOrg = await ensureOrg(orgName)
      if (newOrg) setOrg(newOrg)

      return { error: null }
    } catch (e: any) {
      return { error: e.message || 'Erreur inscription.' }
    }
  }

  const handleSignOut = async () => {
    try { await (authClient as any).signOut() } catch {}
    setUser(null)
    setOrg(null)
  }

  return (
    <AuthContext.Provider value={{ user, org, loading, signIn, signUp, signOut: handleSignOut, refreshOrg }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
