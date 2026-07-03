import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { calculatePayroll, formatXOF, MONTH_NAMES, PayrollInput, PayrollResult } from '../lib/payroll'
import { generateBulletinPDF, uploadBulletinToStorage } from '../lib/pdf'
import { sendBulletinEmail } from '../lib/email'
import { ArrowLeft, Calculator, FileText, Save, Lock, Loader2, Search, Info, Upload, Mail, CheckCircle2 } from 'lucide-react'

interface Employee {
  id: string; first_name: string; last_name: string; matricule: string | null
  position: string | null; category: string | null; marital_status: string
  children_count: number; client_id: string; clients?: { name: string } | null
}
interface PayrollVariable {
  id: string; employee_id: string; period_id: string; base_salary: number
  overtime_premium: number; pregnancy_allowance: number; function_allowance: number
  communication_allowance: number; housing_premium: number; meal_premium: number
  transport_allowance: number; salary_advance: number; loan_payment: number
  flat_deduction: number; gross_salary: number; cnss_employee: number
  amu_employee: number; irpp_brut: number; ricf: number; irpp_net: number
  total_deductions: number; net_payable: number; cnss_employer: number
  amu_employer: number; status: string
}

const EMPTY_VARS = {
  base_salary: 0, overtime_premium: 0, pregnancy_allowance: 0,
  function_allowance: 0, communication_allowance: 0, housing_premium: 0,
  meal_premium: 0, transport_allowance: 0, salary_advance: 0,
  loan_payment: 0, flat_deduction: 0,
}

export default function PayrollVariables() {
  const { periodId } = useParams<{ periodId: string }>()
  const { org } = useAuth()
  const [period, setPeriod] = useState<any>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [variables, setVariables] = useState<Map<string, PayrollVariable>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_VARS)
  const [result, setResult] = useState<PayrollResult | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  useEffect(() => { if (periodId) fetchData() }, [periodId])

  const fetchData = async () => {
    if (!periodId) return
    const { data: periodData } = await supabase.from('payroll_periods').select('*, clients(name, logo_url, num_employeur, nif, bp, phone, entite_name)').eq('id', periodId).single()
    setPeriod(periodData)
    if (!periodData) { setLoading(false); return }
    const { data: empData } = await supabase.from('employees').select('*, clients(name)').eq('client_id', periodData.client_id).eq('active', true).order('last_name')
    setEmployees(empData || [])
    const { data: varData } = await supabase.from('payroll_variables').select('*').eq('period_id', periodId)
    const varMap = new Map<string, PayrollVariable>()
    ;(varData || []).forEach((v) => varMap.set(v.employee_id, v))
    setVariables(varMap)
    setLoading(false)
  }

  const selectEmployee = (emp: Employee) => {
    setSelectedEmpId(emp.id)
    const existing = variables.get(emp.id)
    if (existing) {
      setForm({
        base_salary: existing.base_salary || 0,
        overtime_premium: existing.overtime_premium || 0,
        pregnancy_allowance: existing.pregnancy_allowance || 0,
        function_allowance: existing.function_allowance || 0,
        communication_allowance: existing.communication_allowance || 0,
        housing_premium: existing.housing_premium || 0,
        meal_premium: existing.meal_premium || 0,
        transport_allowance: existing.transport_allowance || 0,
        salary_advance: existing.salary_advance || 0,
        loan_payment: existing.loan_payment || 0,
        flat_deduction: existing.flat_deduction || 0,
      })
      // Recalcul pour avoir le résultat complet avec le nouveau moteur
      const input: PayrollInput = {
        ...existing,
        flat_deduction: existing.flat_deduction || 0,
        marital_status: emp.marital_status,
        children_count: emp.children_count,
      }
      setResult(calculatePayroll(input))
    } else {
      setForm(EMPTY_VARS)
      setResult(null)
    }
  }

  const handleCalculate = () => {
    if (!selectedEmpId) return
    const emp = employees.find((e) => e.id === selectedEmpId)
    if (!emp) return
    setCalculating(true)
    const input: PayrollInput = { ...form, marital_status: emp.marital_status, children_count: emp.children_count }
    setResult(calculatePayroll(input))
    setCalculating(false)
  }

  const handleSave = async () => {
    if (!selectedEmpId || !periodId || !result) return
    setSaving(true)
    const payload = {
      ...form, ...result,
      employee_id: selectedEmpId, period_id: periodId,
      status: 'calculated', calculated_at: new Date().toISOString(),
      taxable_income: result.taxable_income,
    }
    const existing = variables.get(selectedEmpId)
    if (existing) {
      await supabase.from('payroll_variables').update(payload).eq('id', existing.id)
      const updatedMap = new Map(variables)
      updatedMap.set(selectedEmpId, { ...existing, ...payload } as PayrollVariable)
      setVariables(updatedMap)
    } else {
      const { data } = await supabase.from('payroll_variables').insert(payload).select().single()
      if (data) {
        const newMap = new Map(variables)
        newMap.set(selectedEmpId, data)
        setVariables(newMap)
      }
    }
    setSaving(false)
  }

  const handleGeneratePDF = async () => {
    if (!selectedEmpId || !result || !period) return
    const emp = employees.find((e) => e.id === selectedEmpId)
    if (!emp) return
    await generateBulletinPDF({ employee: emp, period, variables: form, result, orgName: org?.name || '' })
  }

  const handleArchivePDF = async () => {
    if (!selectedEmpId || !result || !period || !org) return
    const emp = employees.find((e) => e.id === selectedEmpId)
    if (!emp) return
    setUploading(true)
    const doc = await generateBulletinPDF({ employee: emp, period, variables: form, result, orgName: org.name || '', returnDoc: true })
    const periodLabel = `${MONTH_NAMES[period.period_month - 1]}-${period.period_year}`
    const { url, error } = await uploadBulletinToStorage(doc, emp.id, periodLabel, org.id)
    setUploading(false)
    if (url) setUploadedUrl(url)
    else alert('Erreur archivage : ' + error)
  }

  const handleSendEmail = async () => {
    if (!selectedEmpId || !result || !period || !org) return
    const emp = employees.find((e) => e.id === selectedEmpId)
    if (!emp || !(emp as any).email) { alert('Email employé manquant.'); return }
    setEmailing(true)
    const doc = await generateBulletinPDF({ employee: emp, period, variables: form, result, orgName: org.name || '', returnDoc: true })
    const pdfBase64 = doc.output('datauristring').split(',')[1]
    const periodLabel = `${MONTH_NAMES[period.period_month - 1]} ${period.period_year}`
    const { success, error } = await sendBulletinEmail({ to: (emp as any).email, employeeName: `${emp.first_name} ${emp.last_name}`, period: periodLabel, pdfBase64, cabinetName: org.name || 'Cabinet' })
    setEmailing(false)
    if (success) setEmailSuccess(true)
    else alert('Erreur envoi : ' + error)
  }

  const handleClosePeriod = async () => {
    if (!periodId || !period) return
    if (!confirm('Clôturer cette période ? Elle sera archivée et ne pourra plus être modifiée.')) return
    await supabase.from('payroll_periods').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', periodId)
    fetchData()
  }

  const filteredEmployees = employees.filter((e) =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(search.toLowerCase())
  )
  const isClosed = period?.status === 'closed'
  const selectedEmp = employees.find((e) => e.id === selectedEmpId)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  if (!period) return <div className="text-center py-12"><p className="text-slate-500">Période introuvable.</p><Link to="/payroll" className="btn-primary mt-4 inline-flex">Retour aux périodes</Link></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link to="/payroll" className="btn-ghost"><ArrowLeft className="w-4 h-4" /> Retour</Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{MONTH_NAMES[period.period_month - 1]} {period.period_year}</h1>
            <p className="text-slate-500">{period.clients?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isClosed
            ? <span className="badge-success">Période clôturée</span>
            : <button onClick={handleClosePeriod} className="btn-secondary"><Lock className="w-4 h-4" /> Clôturer la période</button>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste employés */}
        <div className="lg:col-span-1">
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-10" placeholder="Rechercher..." />
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {filteredEmployees.length === 0
                ? <p className="text-center text-slate-500 py-8 text-sm">Aucun employé actif.</p>
                : filteredEmployees.map((emp) => {
                  const hasVars = variables.has(emp.id)
                  return (
                    <button key={emp.id} onClick={() => selectEmployee(emp)} disabled={isClosed}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-50 transition-colors disabled:cursor-not-allowed ${selectedEmpId === emp.id ? 'bg-primary-50 border-l-4 border-l-primary-600' : 'hover:bg-slate-50'}`}>
                      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium text-sm flex-shrink-0">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-slate-500 truncate">{emp.position || '—'}</p>
                      </div>
                      {hasVars && <span className="badge-info flex-shrink-0">Calculé</span>}
                    </button>
                  )
                })
              }
            </div>
          </div>
        </div>

        {/* Formulaire et résultats */}
        <div className="lg:col-span-2">
          {!selectedEmp ? (
            <div className="card p-12 text-center">
              <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Sélectionnez un employé pour saisir ses variables de paie.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Info employé */}
              <div className="card p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
                    {selectedEmp.first_name[0]}{selectedEmp.last_name[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{selectedEmp.first_name} {selectedEmp.last_name}</h3>
                    <p className="text-sm text-slate-500">{selectedEmp.position || '—'} · {selectedEmp.category || '—'}</p>
                  </div>
                  <div className="ml-auto text-right text-sm text-slate-500">
                    <p className="capitalize">{selectedEmp.marital_status}</p>
                    <p>{selectedEmp.children_count} enfant(s) à charge</p>
                  </div>
                </div>
              </div>

              {/* Variables */}
              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 mb-4">Variables de paie</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { key: 'base_salary', label: 'Salaire de base' },
                    { key: 'overtime_premium', label: 'Sursalaire' },
                    { key: 'pregnancy_allowance', label: 'Indemnité grossesse' },
                    { key: 'function_allowance', label: 'Indemnité de fonction' },
                    { key: 'communication_allowance', label: 'Indemnité communication' },
                    { key: 'housing_premium', label: 'Prime de logement' },
                    { key: 'meal_premium', label: 'Prime de repas' },
                    { key: 'transport_allowance', label: 'Indemnité transport' },
                    { key: 'flat_deduction', label: 'Déduction forfaitaire' },
                    { key: 'salary_advance', label: 'Avance sur salaire' },
                    { key: 'loan_payment', label: 'Remboursement prêt' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="label">{label}</label>
                      <input
                        type="number" min="0" disabled={isClosed}
                        value={(form as any)[key] === 0 ? '' : (form as any)[key]}
                        placeholder="0"
                        onChange={(e) => setForm({ ...form, [key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        className="input"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={handleCalculate} disabled={isClosed || calculating} className="btn-primary">
                    {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    Calculer
                  </button>
                  <button onClick={handleSave} disabled={isClosed || !result || saving} className="btn-secondary">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer
                  </button>
                  <button onClick={handleGeneratePDF} disabled={!result || isClosed} className="btn-ghost text-primary-600 hover:bg-primary-50">
                    <FileText className="w-4 h-4" /> Bulletin PDF
                  </button>
                  <button onClick={handleArchivePDF} disabled={!result || isClosed || uploading} className="btn-ghost text-violet-600 hover:bg-violet-50">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Archiver
                  </button>
                  <button onClick={handleSendEmail} disabled={!result || isClosed || emailing} className="btn-ghost text-emerald-600 hover:bg-emerald-50">
                    {emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : emailSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    {emailSuccess ? 'Envoyé !' : 'Email'}
                  </button>
                </div>
                {uploadedUrl && (
                  <p className="text-xs text-violet-600 mt-2">
                    Archivé · <a href={uploadedUrl} target="_blank" rel="noreferrer" className="underline">Voir le PDF</a>
                  </p>
                )}
              </div>

              {/* Résultats */}
              {result && (
                <div className="card p-6 page-enter">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="font-semibold text-slate-900">Résultats du calcul</h3>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Info className="w-3 h-3" /> CGI OTR 2025 — 
                    </span>
                  </div>
                  <div className="space-y-1">
                    <ResultRow label="Salaire brut" value={result.gross_salary} />
                    <ResultRow label="CNSS salarié (4%)" value={-result.cnss_employee} negative />
                    <ResultRow label="AMU salarié (5%)" value={-result.amu_employee} negative />
                    <ResultRow label="Abattement 28%" value={-result.abattement_28} negative muted />
                    <ResultRow label="Déduction charges famille" value={-result.charges_famille} negative muted />
                    <ResultRow label="Revenu imposable mensuel" value={result.taxable_income_monthly} muted />
                    <ResultRow label="IRPP mensuel" value={-result.irpp_net} negative />
                    {form.salary_advance > 0 && <ResultRow label="Avance sur salaire" value={-form.salary_advance} negative />}
                    {form.loan_payment > 0 && <ResultRow label="Remboursement prêt" value={-form.loan_payment} negative />}
                    <div className="border-t border-slate-200 pt-2 mt-2">
                      <ResultRow label="NET À PAYER" value={result.net_payable} bold />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Charges patronales</p>
                    <div className="space-y-1">
                      <ResultRow label="CNSS employeur (17,5%)" value={result.cnss_employer} muted />
                      <ResultRow label="AMU employeur (5%)" value={result.amu_employer} muted />
                      <ResultRow label="Total charges patronales" value={result.employer_total} bold />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
                    Revenu imposable annuel : {formatXOF(result.taxable_income_annual)} | 
                    IRPP annuel : {formatXOF(result.irpp_net * 12)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultRow({ label, value, negative, bold, muted }: {
  label: string; value: number; negative?: boolean; bold?: boolean; muted?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'text-base font-bold' : 'text-sm'}`}>
      <span className={muted ? 'text-slate-500' : 'text-slate-700'}>{label}</span>
      <span className={`tabular-nums ${negative ? 'text-error-600' : 'text-slate-900'} ${bold ? 'text-lg' : ''}`}>
        {negative ? '− ' : ''}{formatXOF(Math.abs(value))}
      </span>
    </div>
  )
}
