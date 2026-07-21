import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { employeesApi, clientsApi, salaryGridsApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Loader2, Plus, Search, Edit2, Trash2, User, X } from 'lucide-react'

const CONTRACT_TYPES = ['CDI','CDD','Intérim','Stage','Apprentissage']
const STATUTS = ['actif','suspendu','retraité','décédé']
const SITUATIONS = ['celibataire','marie','divorce','veuf']
const CATEGORIES = ['Manœuvre','OS1','OS2','OS3','OP1','OP2','OP3','OHQ','Employé C1','Employé C2','Employé C3','Agent de Maîtrise','Cadre','Cadre Supérieur']

const defaultForm = {
  client_id:'',matricule:'',first_name:'',last_name:'',gender:'M',
  birth_date:'',hire_date:'',position:'',category:'',
  marital_status:'celibataire',children_count:0,
  social_security_number:'',phone:'',email:'',
  active:true,status:'actif',contract_type:'CDI',
  contract_end_date:'',pole:'',responsable:'',
}

export default function Employees() {
  const { org } = useAuth()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [form, setForm] = useState<any>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null)
  const [gridSuggestion, setGridSuggestion] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [emps, cls] = await Promise.all([employeesApi.list(), clientsApi.list()])
      setEmployees(emps); setClients(cls)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Salary grid suggestion when category changes
  useEffect(() => {
    if (form.client_id && form.category) {
      fetch(`/api/salary-grid-suggestion?client_id=${form.client_id}&category=${encodeURIComponent(form.category)}`, { credentials:'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => setGridSuggestion(data))
        .catch(() => setGridSuggestion(null))
    } else {
      setGridSuggestion(null)
    }
  }, [form.client_id, form.category])

  const openCreate = () => { setEditId(null); setForm(defaultForm); setError(''); setGridSuggestion(null); setShowModal(true) }
  const openEdit   = (e: any) => { setEditId(e.id); setForm({...e}); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) return setError('Prénom et nom requis')
    if (!form.client_id) return setError('Client requis')
    setSaving(true); setError('')
    try {
      if (editId) await employeesApi.update(editId, form)
      else await employeesApi.create(form)
      setShowModal(false); load()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await employeesApi.delete(id)
      setDeleteConfirm(null); load()
    } catch (e: any) { alert(e.message) }
  }

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${e.first_name} ${e.last_name} ${e.matricule||''}`.toLowerCase().includes(q)
    const matchClient = !filterClient || e.client_id === filterClient
    const matchStatus = !filterStatus || e.status === filterStatus
    return matchSearch && matchClient && matchStatus
  })

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Employés</h1>
          <p className="text-sm text-gray-500">{filtered.length} employé(s)</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouvel employé
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input placeholder="Rechercher nom, matricule…" value={search} onChange={e=>setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>
        <select value={filterClient} onChange={e=>setFilterClient(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          <option value="">Tous les clients</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          <option value="">Tous les statuts</option>
          {STATUTS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun employé trouvé</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {['Employé','Client','Poste','Catégorie','Statut',''].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(e=>(
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={()=>navigate(`/employees/${e.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800 dark:text-white">{e.last_name} {e.first_name}</div>
                    <div className="text-xs text-gray-400">{e.matricule||'—'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{e.client_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{e.position||'—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{e.category||'—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.status==='actif'?'bg-green-100 text-green-700':e.status==='suspendu'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={ev=>ev.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={()=>openEdit(e)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>setDeleteConfirm(e.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-bold text-gray-800 dark:text-white mb-2">Supprimer cet employé ?</h3>
            <p className="text-sm text-gray-500 mb-4">Cette action est irréversible. Toutes les variables de paie associées seront supprimées.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteConfirm(null)} className="flex-1 btn-secondary">Annuler</button>
              <button onClick={()=>handleDelete(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-xl transition">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Création/Édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-2xl w-full shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">{editId?'Modifier':'Nouvel'} employé</h2>
              <button onClick={()=>setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>

            {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

            <div className="space-y-4">
              {/* Client */}
              <div>
                <label className={labelCls}>Client *</label>
                <select className={inputCls} value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}>
                  <option value="">— Sélectionner —</option>
                  {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Prénom *</label><input className={inputCls} value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})} /></div>
                <div><label className={labelCls}>Nom *</label><input className={inputCls} value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})} /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Matricule</label><input className={inputCls} value={form.matricule||''} onChange={e=>setForm({...form,matricule:e.target.value})} /></div>
                <div>
                  <label className={labelCls}>Genre</label>
                  <select className={inputCls} value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}>
                    <option value="M">Masculin</option><option value="F">Féminin</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Catégorie</label>
                  <select className={inputCls} value={form.category||''} onChange={e=>setForm({...form,category:e.target.value})}>
                    <option value="">— Sélectionner —</option>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Poste/Fonction</label><input className={inputCls} value={form.position||''} onChange={e=>setForm({...form,position:e.target.value})} /></div>
              </div>

              {/* Grid suggestion */}
              {gridSuggestion && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
                  💡 Grille salariale trouvée : <strong>{gridSuggestion.base_salary?.toLocaleString('fr-FR')} FCFA</strong> pour {form.category}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Pôle</label><input className={inputCls} placeholder="Ex: ADMIN, RH…" value={form.pole||''} onChange={e=>setForm({...form,pole:e.target.value})} /></div>
                <div><label className={labelCls}>Responsable</label><input className={inputCls} placeholder="Nom du responsable" value={form.responsable||''} onChange={e=>setForm({...form,responsable:e.target.value})} /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Situation maritale</label>
                  <select className={inputCls} value={form.marital_status} onChange={e=>setForm({...form,marital_status:e.target.value})}>
                    {SITUATIONS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Enfants à charge</label><input type="number" min={0} className={inputCls} value={form.children_count} onChange={e=>setForm({...form,children_count:parseInt(e.target.value)||0})} /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Type de contrat</label>
                  <select className={inputCls} value={form.contract_type||'CDI'} onChange={e=>setForm({...form,contract_type:e.target.value})}>
                    {CONTRACT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Statut</label>
                  <select className={inputCls} value={form.status||'actif'} onChange={e=>setForm({...form,status:e.target.value})}>
                    {STATUTS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Date d'embauche</label><input type="date" className={inputCls} value={form.hire_date||''} onChange={e=>setForm({...form,hire_date:e.target.value})} /></div>
                <div><label className={labelCls}>Date de naissance</label><input type="date" className={inputCls} value={form.birth_date||''} onChange={e=>setForm({...form,birth_date:e.target.value})} /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Téléphone</label><input className={inputCls} value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} /></div>
                <div><label className={labelCls}>Email</label><input type="email" className={inputCls} value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} /></div>
              </div>

              <div><label className={labelCls}>N° Sécurité Sociale</label><input className={inputCls} value={form.social_security_number||''} onChange={e=>setForm({...form,social_security_number:e.target.value})} /></div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={()=>setShowModal(false)} className="flex-1 btn-secondary">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2">
                {saving&&<Loader2 className="w-4 h-4 animate-spin"/>}
                {editId?'Mettre à jour':'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
