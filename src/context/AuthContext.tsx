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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function fetchOrg(): Promise<OrgInfo | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data.org || null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authClient.adapter.getSession()
      .then(async ({ data }: any) => {
        if (data?.user) {
          setUser({ id: data.user.id, email: data.user.email, name: data.user.name })
          setOrg(await fetchOrg())
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await authClient.adapter.signIn.email({ email, password }) as any
    if (error) return { error: error.message || 'Email ou mot de passe incorrect' }
    if (data?.user) {
      setUser({ id: data.user.id, email: data.user.email, name: data.user.name })
      setOrg(await fetchOrg())
    }
    return { error: null }
  }

  const signUp = async (email: string, password: string, orgName: string) => {
    try {
      // 1. Inscription
      const { error } = await authClient.adapter.signUp.email({
        email,
        password,
        name: email.split('@')[0],
      }) as any
      if (error) return { error: error.message }

      // 2. Connexion auto
      const { data, error: signInError } = await authClient.adapter.signIn.email({ email, password }) as any
      if (signInError) return { error: signInError.message }
      if (data?.user) setUser({ id: data.user.id, email: data.user.email })

      // 3. Créer organisation
      const orgRes = await fetch('/api/auth/signup-org', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName }),
      })
      const orgData = await orgRes.json()
      if (!orgRes.ok) return { error: orgData.error || 'Erreur création organisation' }
      setOrg(orgData.org)
      return { error: null }
    } catch (e: any) {
      return { error: e.message }
    }
  }

  const handleSignOut = async () => {
    await authClient.adapter.signOut()
    setUser(null)
    setOrg(null)
  }

  return (
    <AuthContext.Provider value={{ user, org, loading, signIn, signUp, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
