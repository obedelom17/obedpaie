import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface OrgInfo { id: string; name: string }
interface AuthContextType {
  user: User | null; session: Session | null; org: OrgInfo | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, orgName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function toMsg(err: unknown): string {
  if (!err) return 'Erreur inconnue'
  if (typeof err === 'string' && err.length > 0) return err
  if (err instanceof Error) return err.message
  try {
    const e = err as any
    const candidates = [e.message, e.error_description, e.msg, e.error, e.status_description]
    for (const c of candidates) { if (c && typeof c === 'string' && c.length > 0) return c }
    const s = JSON.stringify(e)
    if (s !== '{}' && s !== 'null') return s
    return 'Erreur serveur. Vérifiez la console (F12).'
  } catch { return 'Erreur inconnue' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchOrg = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('organization_id, organizations(id, name)')
      .eq('id', userId)
      .maybeSingle()
    if (data?.organizations) {
      const o = data.organizations as any
      setOrg({ id: o.id, name: o.name })
    } else setOrg(null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) fetchOrg(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) fetchOrg(session.user.id)
      else setOrg(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { console.error('[signIn]', error); return { error: toMsg(error) } }
      return { error: null }
    } catch (e) { console.error('[signIn catch]', e); return { error: toMsg(e) } }
  }

  const signUp = async (email: string, password: string, orgName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { org_name: orgName.trim() || 'Mon Cabinet' } },
      })
      console.log('[signUp data]', JSON.stringify(data))
      console.log('[signUp error]', JSON.stringify(error))
      if (error) return { error: toMsg(error) }
      if (!data?.user) return { error: 'Compte non créé — réessayez.' }
      if (data.user.identities?.length === 0) return { error: 'Email déjà utilisé.' }
      return { error: null }
    } catch (e) { console.error('[signUp catch]', e); return { error: toMsg(e) } }
  }

  const signOut = async () => { await supabase.auth.signOut(); setOrg(null) }

  return (
    <AuthContext.Provider value={{ user, session, org, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
