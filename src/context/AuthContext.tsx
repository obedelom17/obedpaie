import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authClient } from '../lib/auth-client'
import { setAuthToken } from '../lib/api'

interface OrgInfo { id: string; name: string }
interface UserInfo { id: string; email: string; name?: string }
interface AuthContextType {
  user: UserInfo | null
  org: OrgInfo | null
  loading: boolean
  token: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, orgName: string) => Promise<{ error: string | null }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchOrg = async (jwt: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (res.ok) {
        const data = await res.json()
        setOrg(data.org)
      }
    } catch {}
  }

  useEffect(() => {
    authClient.getSession().then(async (res: any) => {
      const sessionData = res?.data ?? res
      const jwt = sessionData?.session?.token || sessionData?.token
      const userData = sessionData?.user
      if (jwt && userData) {
        setToken(jwt); setAuthToken(jwt)
        setUser({ id: userData.id, email: userData.email, name: userData.name })
        await fetchOrg(jwt)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const signIn = async (email: string, password: string) => {
    const signInRes = await authClient.signIn.email({ email, password }) as any
    if (signInRes.error) return { error: signInRes.error.message || 'Erreur de connexion' }
    const sessionData = signInRes.data ?? signInRes
    const jwt = sessionData?.session?.token || sessionData?.token
    const userData = sessionData?.user
    if (jwt) {
      setToken(jwt); setAuthToken(jwt)
      setUser({ id: userData?.id, email: userData?.email || email })
      await fetchOrg(jwt)
    }
    return { error: null }
  }

  const signUp = async (email: string, password: string, orgName: string) => {
    try {
      // 1. Inscription via Neon Auth
      const { data, error } = await authClient.signUp.email({ email, password, name: email.split('@')[0] }) as any
      if (error) return { error: error.message }

      // 2. Connecter pour obtenir JWT
      const signInRes = await authClient.signIn.email({ email, password }) as any
      if (signInRes.error) return { error: signInRes.error.message }

      // Neon Auth peut retourner session dans data ou directement
      const sessionData = signInRes.data ?? signInRes
      const jwt = sessionData?.session?.token || sessionData?.token
      const userData = sessionData?.user || signInRes.data?.user
      if (!jwt) return { error: 'Session invalide' }

      setToken(jwt); setAuthToken(jwt)
      setUser({ id: userData?.id, email: userData?.email || email })

      // 3. Créer organisation
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
    setUser(null); setOrg(null); setToken(null); setAuthToken(null)
  }

  return (
    <AuthContext.Provider value={{ user, org, loading, token, signIn, signUp, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
