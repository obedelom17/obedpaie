import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Calculator, Mail, Lock, Building2, Loader2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const switchMode = (m: 'signin' | 'signup') => {
    setMode(m); setError(null); setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setSuccess(null); setLoading(true)

    if (mode === 'signup') {
      if (!orgName.trim()) { setError('Saisissez le nom du cabinet.'); setLoading(false); return }
      if (password.length < 6) { setError('Mot de passe : 6 caractères minimum.'); setLoading(false); return }
      const { error: err } = await signUp(email, password, orgName)
      if (err) { setError(err); setLoading(false); return }
      // Tentative de connexion auto après inscription
      const { error: loginErr } = await signIn(email, password)
      if (loginErr) {
        setSuccess('Compte créé ! Vérifiez votre email puis connectez-vous.')
        setMode('signin')
      }
    } else {
      const { error: err } = await signIn(email, password)
      if (err) setError(
        err.toLowerCase().includes('invalid') ? 'Email ou mot de passe incorrect.' : err
      )
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 mb-4 shadow-lg">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">ObedPaie</h1>
          <p className="text-slate-400 mt-2">Centralisation & pré-calcul de paie multi-client</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Onglets */}
          <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg">
            <button onClick={() => switchMode('signin')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'signin' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Connexion
            </button>
            <button onClick={() => switchMode('signup')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'signup' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Nom du cabinet</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                    className="input pl-10" placeholder="Cabinet Comptable Exemple" required />
                </div>
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10" placeholder="contact@cabinet.tg" autoComplete="email" />
              </div>
            </div>

            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type={showPassword ? 'text' : 'password'} required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10 pr-10" placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'signup' && <p className="text-xs text-slate-400 mt-1">6 caractères minimum</p>}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading
                ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                : mode === 'signin' ? 'Se connecter' : 'Créer le compte'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-slate-400 text-sm mt-6">
          Conforme CGI OTR 2025 · Code du Travail Togo 2021
        </p>
      </div>
    </div>
  )
}
