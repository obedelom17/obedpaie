import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authClient, getJWTToken } from '../lib/auth-client'
import { setAuthToken } from '../lib/api'

interface OrgInfo { id: string; name: string }
interface UserInfo { id: string; email: string; name?: string }
interface AuthContextType {
  user: UserInfo | null
  org: OrgInfo | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, orgName: string) => Promise<{ error: string | null }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function refreshToken() {
  const jwt = await getJWTToken()
  if (jwt) setAuthToken(jwt)
  return jwt
}

async function fetchOrg(jwt: string) {
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${jwt}` } })
    if (res.ok) return (await res.json()).org
  } catch {}
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authClient.getSession().then(async (res: any) => {
      const userData = res?.data?.user ?? res?.user
      if (userData) {
        setUser({ id: userData.id, email: userData.email, name: userData.name })
        const jwt = await refreshToken()
        if (jwt) setOrg(await fetchOrg(jwt))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string) => {
    const res = await authClient.signIn.email({ email, password }) as any
    if (res.error) return { error: res.error.message || 'Erreur de connexion' }
    const userData = res.data?.user ?? res.user
    if (userData) {
      setUser({ id: userData.id, email: userData.email })
      const jwt = await refreshToken()
      if (jwt) setOrg(await fetchOrg(jwt))
    }
    return { error: null }
  }

  const signUp = async (email: string, password: string, orgName: string) => {
    try {
      const res = await authClient.signUp.email({ email, password, name: email.split('@')[0] }) as any
      if (res.error) return { error: res.error.message }

      // Sign in après inscription
      const signInRes = await authClient.signIn.email({ email, password }) as any
      if (signInRes.error) return { error: signInRes.error.message }

      const userData = signInRes.data?.user ?? signInRes.user
      if (userData) setUser({ id: userData.id, email: userData.email })

      const jwt = await refreshToken()
      if (!jwt) return { error: 'Token introuvable après connexion' }

      // Créer organisation
      const orgRes = await fetch('/api/auth/signup-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ orgName }),
      })
      const orgData = await orgRes.json()
      if (!orgRes.ok) return { error: orgData.error }

      setOrg(orgData.org)
      return { error: null }
    } catch (e: any) { return { error: e.message } }
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    setUser(null); setOrg(null); setAuthToken(null)
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
