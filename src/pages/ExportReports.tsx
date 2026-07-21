import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'

interface Client { id: string; name: string }
interface Period { id: string; period_month: number; period_year: number; status: string; client_name: string; client_id: string }
interface Employee { id: string; first_name: string; last_name: string; hire_date: string; position: string }

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

type Tab = 'bulletin' | 'etat' | 'bordereau' | 'irpp' | 'solde'

export default function ExportReports() {
  const [clients, setClients] = useState<Client[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [bulletinEmployees, setBulletinEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('bulletin')
  const [msg, setMsg] = useState<{type:'success'|'error', text:string}|null>(null)

  // Bulletin
  const [bPeriod, setBPeriod] = useState('')
  const [bEmployee, setBEmployee] = useState('')
  const [bAll, setBAll] = useState(false)
  // Etat charges
  const [ePeriod, setEPeriod] = useState('')
  const [eRegul, setERegul] = useState(false)
  // Bordereau CNSS
  const [cPeriod, setCPeriod] = useState('')
  // IRPP
  const [iPeriod, setIPeriod] = useState('')
  // Solde
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
  const [sJoursConges, setSJoursConges] = useState<{nb:string;label:string}[]>([{nb:'',label:''}])
  const [sTauxAuto, setSTauxAuto] = useState(true)
  const [sTauxManuel, setSTauxManuel] = useState('0')

  useEffect(() => {
    apiFetch('/api/clients').then(setClients).catch(()=>{})
    apiFetch('/api/payroll').then(setPeriods).catch(()=>{})
  }, [])

  useEffect(() => {
    if (sClient) apiFetch(`/api/employees?client_id=${sClient}`).then(setEmployees).catch(()=>{})
  }, [sClient])

  useEffect(() => {
    if (!bPeriod) { setBulletinEmployees([]); return }
    const p = periods.find(p => p.id === bPeriod)
    if (p?.client_id) apiFetch(`/api/employees?client_id=${p.client_id}`).then(setBulletinEmployees).catch(()=>{})
  }, [bPeriod, periods])

  const download = async (url: string, body: object, filename: string) => {
    setLoading(true); setMsg(null)
    try {
      const res = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const e = await res.json().catch(()=>({error:'Erreur'})); throw new Error(e.error) }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = filename; a.click()
      setMsg({ type:'success', text:'Fichier téléchargé ✓' })
    } catch (e: any) {
      setMsg({ type:'error', text: e.message })
    } finally { setLoading(false) }
  }

  const getPeriodLabel = (id: string) => {
    const p = periods.find(p => p.id === id)
    return p ? `${MOIS[p.period_month-1]} ${p.period_year}` : ''
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1 uppercase tracking-wide"

  const tabs: {key: Tab; label: string; emoji: string}[] = [
    {key:'bulletin',  label:'Bulletin de paie',       emoji:'📄'},
    {key:'etat',      label:'État des charges',        emoji:'📊'},
    {key:'bordereau', label:'Bordereau CNSS/AMU',      emoji:'🏛️'},
    {key:'irpp',      label:'Déclaration IRPP',        emoji:'💰'},
    {key:'solde',     label:'Solde de tout compte',    emoji:'📋'},
  ]

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">Exports & Rapports</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Générez tous vos documents officiels en Excel</p>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${msg.type==='success'?'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400':'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setMsg(null) }}
            className={`flex-shrink-0 py-2 px-3 rounded-lg text-xs font-medium transition-all ${tab===t.key?'bg-white dark:bg-gray-700 text-blue-600 shadow':'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ── Bulletin ── */}
      {tab==='bulletin' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-white">Bulletin de paie (format DVV)</h2>
          <div>
            <label className={labelCls}>Période de paie</label>
            <select className={inputCls} value={bPeriod} onChange={e=>{setBPeriod(e.target.value);setBEmployee('');setBAll(false)}}>
              <option value="">— Sélectionner —</option>
              {periods.map(p=><option key={p.id} value={p.id}>{p.client_name} — {MOIS[p.period_month-1]} {p.period_year}</option>)}
            </select>
          </div>
          {bPeriod && (<>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={bAll} onChange={e=>setBAll(e.target.checked)} className="h-4 w-4 rounded" />
              Télécharger tous les bulletins de la période
            </label>
            {!bAll && (
              <div>
                <label className={labelCls}>Employé</label>
                <select className={inputCls} value={bEmployee} onChange={e=>setBEmployee(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {bulletinEmployees.map(e=><option key={e.id} value={e.id}>{e.last_name} {e.first_name}</option>)}
                </select>
              </div>
            )}
          </>)}
          <button onClick={async () => {
            if (!bPeriod) return setMsg({type:'error',text:'Sélectionne une période'})
            const p = periods.find(p=>p.id===bPeriod)
            const lbl = getPeriodLabel(bPeriod)
            if (bAll) {
              setLoading(true); setMsg(null)
              let ok=0, fail=0
              for (const emp of bulletinEmployees) {
                try {
                  const res = await fetch('/api/export-bulletin',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({period_id:bPeriod,employee_id:emp.id})})
                  if (res.ok) {
                    const blob=await res.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Bulletin_${emp.last_name}_${lbl}.xlsx`;a.click();ok++
                  } else fail++
                } catch { fail++ }
              }
              setLoading(false)
              setMsg(ok>0?{type:'success',text:`${ok} bulletin(s) téléchargé(s)${fail>0?` (${fail} erreur(s))`:''}` }:{type:'error',text:'Aucun bulletin généré. Vérifiez que les variables ont été enregistrées.'})
            } else {
              if (!bEmployee) return setMsg({type:'error',text:'Sélectionne un employé'})
              const emp = bulletinEmployees.find(e=>e.id===bEmployee)
              await download('/api/export-bulletin',{period_id:bPeriod,employee_id:bEmployee},`Bulletin_${emp?.last_name||'employe'}_${lbl}.xlsx`)
            }
          }} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading?'Génération…':'⬇ Télécharger Bulletin(s) .xlsx'}
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
              {periods.map(p=><option key={p.id} value={p.id}>{p.client_name} — {MOIS[p.period_month-1]} {p.period_year}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={eRegul} onChange={e=>setERegul(e.target.checked)} className="h-4 w-4 rounded" />
            Inclure colonne régularisation IRPP
          </label>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
            CNSS 4%+17,5% · AMU 5%+5% · IRPP selon barème CGI OTR 2025
          </div>
          <button onClick={()=>{
            if(!ePeriod) return setMsg({type:'error',text:'Sélectionne une période'})
            const p=periods.find(p=>p.id===ePeriod)
            download('/api/export-etat-charges',{period_id:ePeriod,avec_regularisation:eRegul},`Etat_Charges_${getPeriodLabel(ePeriod)}${eRegul?'_regul':''}.xlsx`)
          }} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading?'Génération…':'⬇ Télécharger État des charges .xlsx'}
          </button>
        </div>
      )}

      {/* ── Bordereau CNSS/AMU ── */}
      {tab==='bordereau' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-white">Bordereau CNSS / AMU</h2>
          <div>
            <label className={labelCls}>Période de paie</label>
            <select className={inputCls} value={cPeriod} onChange={e=>setCPeriod(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {periods.map(p=><option key={p.id} value={p.id}>{p.client_name} — {MOIS[p.period_month-1]} {p.period_year}</option>)}
            </select>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300">
            Bordereau au format paysage avec N° assuré, salaire brut, cotisations CNSS et AMU salarié + patronal.
          </div>
          <button onClick={()=>{
            if(!cPeriod) return setMsg({type:'error',text:'Sélectionne une période'})
            download('/api/export-bordereau-cnss',{period_id:cPeriod},`Bordereau_CNSS_AMU_${getPeriodLabel(cPeriod)}.xlsx`)
          }} disabled={loading} className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading?'Génération…':'⬇ Télécharger Bordereau CNSS/AMU .xlsx'}
          </button>
        </div>
      )}

      {/* ── IRPP ── */}
      {tab==='irpp' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 dark:text-white">Déclaration IRPP trimestrielle</h2>
          <div>
            <label className={labelCls}>Période de référence</label>
            <select className={inputCls} value={iPeriod} onChange={e=>setIPeriod(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {periods.map(p=><option key={p.id} value={p.id}>{p.client_name} — {MOIS[p.period_month-1]} {p.period_year}</option>)}
            </select>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-xs text-purple-700 dark:text-purple-300">
            Tableau N° assuré, revenu brut imposable, IRPP calculé, régularisation et IRPP à verser.
          </div>
          <button onClick={()=>{
            if(!iPeriod) return setMsg({type:'error',text:'Sélectionne une période'})
            download('/api/export-irpp',{period_id:iPeriod},`IRPP_${getPeriodLabel(iPeriod)}.xlsx`)
          }} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading?'Génération…':'⬇ Télécharger Déclaration IRPP .xlsx'}
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
              <select className={inputCls} value={sClient} onChange={e=>{setSClient(e.target.value);setSEmployee('');setSPeriod('')}}>
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
            <label className={labelCls}>Dernier bulletin (optionnel)</label>
            <select className={inputCls} value={sPeriod} onChange={e=>setSPeriod(e.target.value)}>
              <option value="">— Aucun —</option>
              {periods.filter(p=>p.client_id===sClient).map(p=><option key={p.id} value={p.id}>{MOIS[p.period_month-1]} {p.period_year}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Date de départ *</label><input type="date" className={inputCls} value={sDateDepart} onChange={e=>setSDateDepart(e.target.value)} /></div>
            <div><label className={labelCls}>Fin de contrat</label><input type="date" className={inputCls} value={sDateFin} onChange={e=>setSDateFin(e.target.value)} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls}>Congés acquis non jouis</label>
              <div className="flex gap-1">
                {[true,false].map(auto=>(
                  <button key={String(auto)} onClick={()=>setSTauxAuto(auto)} className={`px-2 py-0.5 rounded text-xs ${sTauxAuto===auto?'bg-blue-600 text-white':'bg-gray-200 text-gray-600'}`}>
                    {auto?'Auto (jours/30)':'Manuel'}
                  </button>
                ))}
              </div>
            </div>
            {sJoursConges.map((j,i)=>(
              <div key={i} className="flex gap-2 mb-2">
                <input type="number" placeholder="Nb jours" className={`${inputCls} w-28`} value={j.nb} onChange={e=>{const n=[...sJoursConges];n[i].nb=e.target.value;setSJoursConges(n)}} />
                <input type="text" placeholder="Période (ex: Jan-Juin 2025)" className={inputCls} value={j.label} onChange={e=>{const n=[...sJoursConges];n[i].label=e.target.value;setSJoursConges(n)}} />
                {i>0&&<button onClick={()=>setSJoursConges(sJoursConges.filter((_,x)=>x!==i))} className="text-red-500 text-sm">✕</button>}
              </div>
            ))}
            <button onClick={()=>setSJoursConges([...sJoursConges,{nb:'',label:''}])} className="text-blue-600 text-xs hover:underline">+ Ajouter période</button>
            {!sTauxAuto&&(<div className="mt-2"><label className={labelCls}>Taux manuel</label><input type="number" step="0.001" className={inputCls} value={sTauxManuel} onChange={e=>setSTauxManuel(e.target.value)} /></div>)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Avance sur solde (FCFA)</label><input type="number" className={inputCls} value={sAvance} onChange={e=>setSAvance(e.target.value)} /></div>
            <div><label className={labelCls}>Retenues arriérées (FCFA)</label><input type="number" className={inputCls} value={sRetenuesArr} onChange={e=>setSRetenuesArr(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Régularisation IRPP (FCFA)</label><input type="number" className={inputCls} value={sRegulIrpp} onChange={e=>setSRegulIrpp(e.target.value)} /></div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={sInclurePreavis} onChange={e=>setSInclurePreavis(e.target.checked)} className="h-4 w-4 rounded" />
                Inclure préavis
              </label>
            </div>
          </div>
          {sInclurePreavis&&(<div><label className={labelCls}>Montant du préavis (FCFA)</label><input type="number" className={inputCls} value={sPreavis} onChange={e=>setSPreavis(e.target.value)} /></div>)}
          <button onClick={()=>{
            if(!sEmployee) return setMsg({type:'error',text:'Sélectionne un employé'})
            if(!sDateDepart) return setMsg({type:'error',text:'Date de départ requise'})
            const emp=employees.find(e=>e.id===sEmployee)
            const joursConges=sJoursConges.filter(j=>j.nb&&parseFloat(j.nb)>0).map(j=>[parseFloat(j.nb),j.label])
            download('/api/export-solde',{
              employee_id:sEmployee,period_id:sPeriod||undefined,
              date_depart:sDateDepart,date_fin_contrat:sDateFin||sDateDepart,
              jours_conges_list:joursConges,taux_conges_auto:sTauxAuto,taux_conges_manuel:parseFloat(sTauxManuel)||0,
              avance:parseFloat(sAvance)||0,preavis:parseFloat(sPreavis)||0,inclure_preavis:sInclurePreavis,
              retenues_arrierees:parseFloat(sRetenuesArr)||0,regularisation_irpp:parseFloat(sRegulIrpp)||0,
            },`Solde_${emp?.last_name||'employe'}_${sDateDepart}.xlsx`)
          }} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition">
            {loading?'Génération…':'⬇ Télécharger Solde de tout compte .xlsx'}
          </button>
        </div>
      )}
    </div>
  )
}
