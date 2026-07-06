import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Settings as SettingsIcon, Mail, Save, Loader2, CheckCircle, Eye, EyeOff, Info } from 'lucide-react'

interface SmtpConfig {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_pass: string
  smtp_from: string
  smtp_from_name: string
}

const EMPTY: SmtpConfig = {
  smtp_host: '', smtp_port: 587,
  smtp_user: '', smtp_pass: '',
  smtp_from: '', smtp_from_name: '',
}

const PRESETS: Record<string, Partial<SmtpConfig>> = {
  gmail:   { smtp_host: 'smtp.gmail.com',   smtp_port: 587 },
  outlook: { smtp_host: 'smtp.office365.com', smtp_port: 587 },
  yahoo:   { smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587 },
  custom:  {},
}

export default function Settings() {
  const { org } = useAuth()
  const [form, setForm] = useState<SmtpConfig>(EMPTY)
  const [preset, setPreset] = useState('gmail')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => { if (org) fetchConfig() }, [org])

  const fetchConfig = async () => {
    const { data } = await supabase
      .from('organizations')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_from_name')
      .eq('id', org!.id)
      .maybeSingle()
    if (data) setForm({ ...EMPTY, ...data })
  }

  const applyPreset = (p: string) => {
    setPreset(p)
    setForm(f => ({ ...f, ...PRESETS[p] }))
  }

  const handleSave = async () => {
    if (!org) return
    setSaving(true); setSaved(false)
    await supabase.from('organizations').update(form).eq('id', org.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleTest = async () => {
    if (!org) return
    setTesting(true); setTestResult(null)
    const { data, error } = await supabase.functions.invoke('send-test-email', {
      body: { orgId: org.id, smtp: form },
    })
    setTesting(false)
    if (error) setTestResult('❌ ' + error.message)
    else if (data?.success) setTestResult('✅ Email de test envoyé à ' + form.smtp_user)
    else setTestResult('❌ ' + (data?.error || 'Erreur inconnue'))
  }

  const f = (k: keyof SmtpConfig, v: string | number) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <SettingsIcon className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
          <p className="text-slate-500 text-sm">Configuration de l'envoi d'emails</p>
        </div>
      </div>

      <div className="card p-6 space-y-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 text-primary-600" />
          <h2 className="font-semibold text-slate-900">Configuration SMTP</h2>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-700">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Gmail :</strong> activez l'authentification à 2 facteurs → <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">Mot de passe d'application</a> → utilisez ce mot de passe ci-dessous.<br/>
            <strong>Yahoo / Outlook :</strong> pareil, créez un mot de passe d'application.
          </div>
        </div>

        {/* Preset buttons */}
        <div>
          <label className="label mb-2">Fournisseur</label>
          <div className="flex gap-2 flex-wrap">
            {Object.keys(PRESETS).map(p => (
              <button key={p} onClick={() => applyPreset(p)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${preset === p ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Serveur SMTP</label>
            <input value={form.smtp_host} onChange={e => f('smtp_host', e.target.value)} className="input" placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="label">Port</label>
            <input type="number" value={form.smtp_port} onChange={e => f('smtp_port', Number(e.target.value))} className="input" />
          </div>
          <div>
            <label className="label">Email expéditeur</label>
            <input type="email" value={form.smtp_user} onChange={e => f('smtp_user', e.target.value)} className="input" placeholder="vous@gmail.com" />
          </div>
          <div className="col-span-2">
            <label className="label">Mot de passe d'application</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.smtp_pass} onChange={e => f('smtp_pass', e.target.value)} className="input pr-10" placeholder="xxxx xxxx xxxx xxxx" />
              <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Nom affiché</label>
            <input value={form.smtp_from_name} onChange={e => f('smtp_from_name', e.target.value)} className="input" placeholder="Mon Cabinet" />
          </div>
          <div>
            <label className="label">Email d'envoi (from)</label>
            <input type="email" value={form.smtp_from} onChange={e => f('smtp_from', e.target.value)} className="input" placeholder="vous@gmail.com" />
          </div>
        </div>

        {testResult && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${testResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Enregistré !' : 'Enregistrer'}
          </button>
          <button onClick={handleTest} disabled={testing || !form.smtp_host} className="btn-secondary flex items-center gap-2">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Tester l'envoi
          </button>
        </div>
      </div>
    </div>
  )
}
