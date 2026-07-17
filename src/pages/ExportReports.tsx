import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../context/AuthContext'

interface Client { id: string; name: string }
interface Period { id: string; period_month: number; period_year: number; status: string; client_name: string; client_id: string }
interface Employee { id: string; first_name: string; last_name: string; hire_date: string; position: string }

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

export default function ExportReports() {
  const { org } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'bulletin'|'etat'|'solde'>('bulletin')

  // Bulletin state
  const [bPeriod, setBPeriod] = useState('')
  const [bEmployee, setBEmployee] = useState('')
  const [bAll, setBAll] = useState(false)

  // Etat charges state
  const [ePeriod, setEPeriod] = useState('')
  const [eRegul, setERegul] = useState(false)

  // Solde state
  const [sEmployee, setSEmployee] = useState('')
  const [sClient, setSClient] = useState('')
  const [sPeriod, setSPeriod] = useState('')
  const [sDateDepart, setSDateDepart] = useState('')
  const [sDateFin, setSDateFin] = useState('')
  const [sAvance, setSAvance] = useState('0')
  const [sPreavis, setSPreavis] = useState('0')
  const [sInclurePreavis, setSInclurePreavis] = useState(false)
  const [sRetenuesArr, setSRetenuesArr] = useState('0')
  const [sRegulIrpp, setSRegulIrpp] = useState('0')
  const [sJoursConges, setSJoursConges] = useState<{nb: string; label: string}[]>([{nb:'', label:''}])
  const [sTauxAuto, setSTauxAuto] = useState(true)
  const [sTauxManuel, setSTauxManuel] = useState('0')

  const [msg, setMsg] = useState<{type:'success'|'error', text:string}|null>(null)

  useEffect(() => {
    apiFetch('/api/clients').then(d => setClients(d)).catch(()=>{})
    apiFetch('/api/payroll').then(d => setPeriods(d)).catch(()=>{})
  }, [])

  useEffect(() => {
    if (sClient) {
      apiFetch(`/api/employees?client_id=${sClient}`).then(d => setEmployees(d)).catch(()=>{})
    }
  }, [sClient])

  async function download(url: string, body: object, filename: string) {
    setLoading(true); setMsg(null)
    try {
      const res = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(()=>({error:'Erreur serveur'}))
        throw new Error(err.error)
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      setMsg({type:'success', text:'Fichier téléchargé'})
    } catch (e: any) {
      setMsg({type:'error', text: e.message})
    } finally {
      setLoading(false)
    }
  }

  async function handleBulletin() {
    if (!bPeriod) return setMsg({type:'error', text:'Sélectionne une période'})
    if (!bEmployee && !bAll) return setMsg({type:'error', text:'Sélectionne un employé'})
    const p = periods.find(p=>p.id===bPeriod)
    const mois = p ? MOIS[p.period_month-1] : ''
    const annee = p?.period_year || ''

    if (bAll) {
      // Télécharger tous les bulletins de la période (un par un)
      const emps = await apiFetch(`/api/employees?client_id=${p?.client_id}`)
      for (const emp of emps) {
        await download('/api/export-bulletin',
          { period_id: bPeriod, employee_id: emp.id },
          `Bulletin_${emp.last_name}_${mois}_${annee}.xlsx`)
      }
    } else {
      const emp = employees.find(e=>e.id===bEmployee) || {last_name:'Employe'}
      await download('/api/export-bulletin',
        { period_id: bPeriod, employee_id: bEmployee },
        `Bulletin_${(emp as any).last_name}_${mois}_${annee}.xlsx`)
    }
  }

  async function handleEtat() {
    if (!ePeriod) return setMsg({type:'error', text:'Sélectionne une période'})
    const p = periods.find(p=>p.id===ePeriod)
    const mois = p ? MOIS[p.period_month-1] : ''
    const annee = p?.period_year || ''
    await download('/api/export-etat-charges',
      { period_id: ePeriod, avec_regularisation: eRegul },
      `Etat_Charges_${mois}_${annee}${eRegul?'_regul':''}.xlsx`)
  }

  async function handleSolde() {
    if (!sEmployee) return setMsg({type:'error', text:'Sélectionne un employé'})
    if (!sDateDepart) return setMsg({type:'error', text:'Date de départ requise'})
    const emp = employees.find(e=>e.id===sEmployee)
    const joursConges = sJoursConges
      .filter(j=>j.nb && parseFloat(j.nb)>0)
      .map(j=>[parseFloat(j.nb), j.label])
    await download('/api/export-solde', {
      employee_id: sEmployee,
      period_id: sPeriod || undefined,
      date_depart: sDateDepart,
      date_fin_contrat: sDateFin || sDateDepart,
      jours_conges_list: joursConges,
      taux_conges_auto: sTauxAuto,
      taux_conges_manuel: parseFloat(sTauxManuel)||0,
      avance: parseFloat(sAvance)||0,
      preavis: parseFloat(sPreavis)||0,
      inclure_preavis: sInclurePreavis,
      retenues_arrierees: parseFloat(sRetenuesArr)||0,
      regularisation_irpp: parseFloat(sRegulIrpp)||0,
    }, `Solde_${(emp as any)?.last_name||'employe'}_${sDateDepart}.xlsx`)
  }

  const periodsByClient = (cid: string) => periods.filter(p=>p.client_id===cid)

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 uppercase tracking-wide"

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Exports & Rapports</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Générer les fichiers Excel au format exact</p>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${msg.type==='success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        {([['bulletin','📄 Bulletin de paie'],['etat','📊 État des charges'],['solde','📋 Solde de tout compte']] as const).map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${tab===key ? 'bg-white dark:bg-gray-700 text-blue-600 shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Bulletin de paie ── */}
      {tab==='bulletin' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-white">Bulletin de paie (format DVV)</h2>

          <div>
            <label className={labelCls}>Période de paie</label>
            <select className={inputCls} value={bPeriod} onChange={e=>{ setBPeriod(e.target.value); setBEmployee('') }}>
              <option value="">— Sélectionner —</option>
              {periods.map(p=>(
                <option key={p.id} value={p.id}>{p.client_name} — {MOIS[p.period_month-1]} {p.period_year} ({p.status})</option>
              ))}
            </select>
          </div>

          {bPeriod && (
            <>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ball" checked={bAll} onChange={e=>setBAll(e.target.checked)} className="h-4 w-4 rounded" />
                <label htmlFor="ball" className="text-sm text-gray-700 dark:text-gray-300">Télécharger tous les bulletins de la période</label>
              </div>

              {!bAll && (
                <div>
                  <label className={labelCls}>Employé</label>
                  <select className={inputCls} value={bEmployee} onChange={e=>setBEmployee(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {periods.find(p=>p.id===bPeriod) && employees
                      .filter(()=>true)
                      .map(e=>(
                        <option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>
                      ))
                    }
                  </select>
                </div>
              )}
            </>
          )}

          <button onClick={handleBulletin} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading ? 'Génération...' : '⬇ Télécharger Bulletin(s) .xlsx'}
          </button>
        </div>
      )}

      {/* ── État des charges ── */}
      {tab==='etat' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-white">État des charges (format banques)</h2>

          <div>
            <label className={labelCls}>Période de paie</label>
            <select className={inputCls} value={ePeriod} onChange={e=>setEPeriod(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {periods.map(p=>(
                <option key={p.id} value={p.id}>{p.client_name} — {MOIS[p.period_month-1]} {p.period_year}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="eregul" checked={eRegul} onChange={e=>setERegul(e.target.checked)} className="h-4 w-4 rounded" />
            <label htmlFor="eregul" className="text-sm text-gray-700 dark:text-gray-300">Inclure colonne régularisation IRPP</label>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
            Génère 2 onglets : sans régularisation + avec régularisation (si coché).<br/>
            Calculs : CNSS 4% + 17,5% · AMU 5% + 5% · IRPP selon barème CGI OTR 2025.
          </div>

          <button onClick={handleEtat} disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading ? 'Génération...' : '⬇ Télécharger État des charges .xlsx'}
          </button>
        </div>
      )}

      {/* ── Solde de tout compte ── */}
      {tab==='solde' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-white">Solde de tout compte</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client</label>
              <select className={inputCls} value={sClient} onChange={e=>{ setSClient(e.target.value); setSEmployee(''); setSPeriod('') }}>
                <option value="">— Sélectionner —</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Employé</label>
              <select className={inputCls} value={sEmployee} onChange={e=>setSEmployee(e.target.value)} disabled={!sClient}>
                <option value="">— Sélectionner —</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Dernier bulletin (optionnel — pour salaire du mois)</label>
            <select className={inputCls} value={sPeriod} onChange={e=>setSPeriod(e.target.value)}>
              <option value="">— Aucun —</option>
              {periodsByClient(sClient).map(p=>(
                <option key={p.id} value={p.id}>{MOIS[p.period_month-1]} {p.period_year}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date de départ *</label>
              <input type="date" className={inputCls} value={sDateDepart} onChange={e=>setSDateDepart(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Fin de contrat</label>
              <input type="date" className={inputCls} value={sDateFin} onChange={e=>setSDateFin(e.target.value)} />
            </div>
          </div>

          {/* Congés */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Congés acquis non jouis</label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Taux:</span>
                <button onClick={()=>setSTauxAuto(true)} className={`px-2 py-0.5 rounded text-xs ${sTauxAuto ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>Auto (jours/30)</button>
                <button onClick={()=>setSTauxAuto(false)} className={`px-2 py-0.5 rounded text-xs ${!sTauxAuto ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>Manuel</button>
              </div>
            </div>
            {sJoursConges.map((j,i)=>(
              <div key={i} className="flex gap-2 mb-2">
                <input type="number" placeholder="Nb jours" className={`${inputCls} w-28`} value={j.nb} onChange={e=>{const n=[...sJoursConges];n[i].nb=e.target.value;setSJoursConges(n)}} />
                <input type="text" placeholder="Période (ex: Jan-Juin 2025)" className={inputCls} value={j.label} onChange={e=>{const n=[...sJoursConges];n[i].label=e.target.value;setSJoursConges(n)}} />
                {i>0 && <button onClick={()=>setSJoursConges(sJoursConges.filter((_,x)=>x!==i))} className="text-red-500 text-sm">✕</button>}
              </div>
            ))}
            <button onClick={()=>setSJoursConges([...sJoursConges,{nb:'',label:''}])} className="text-blue-600 text-xs hover:underline">+ Ajouter période de congés</button>
            {!sTauxAuto && (
              <div className="mt-2">
                <label className={labelCls}>Taux manuel</label>
                <input type="number" step="0.001" className={inputCls} value={sTauxManuel} onChange={e=>setSTauxManuel(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Avance sur solde (FCFA)</label>
              <input type="number" className={inputCls} value={sAvance} onChange={e=>setSAvance(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Retenues arriérées (FCFA)</label>
              <input type="number" className={inputCls} value={sRetenuesArr} onChange={e=>setSRetenuesArr(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Régularisation IRPP (FCFA)</label>
              <input type="number" className={inputCls} value={sRegulIrpp} onChange={e=>setSRegulIrpp(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end gap-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="spreavis" checked={sInclurePreavis} onChange={e=>setSInclurePreavis(e.target.checked)} className="h-4 w-4 rounded" />
                <label htmlFor="spreavis" className="text-sm text-gray-700 dark:text-gray-300">Inclure préavis</label>
              </div>
            </div>
          </div>

          {sInclurePreavis && (
            <div>
              <label className={labelCls}>Montant du préavis (FCFA)</label>
              <input type="number" className={inputCls} value={sPreavis} onChange={e=>setSPreavis(e.target.value)} />
            </div>
          )}

          <button onClick={handleSolde} disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading ? 'Génération...' : '⬇ Télécharger Solde de tout compte .xlsx'}
          </button>
        </div>
      )}
    </div>
  )
}
