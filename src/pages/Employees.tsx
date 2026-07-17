import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { employeesApi, clientsApi } from '../lib/api'
import { Users, Plus, Search, Pencil, Trash2, X, Filter } from 'lucide-react'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/ui/Toast'

interface Employee { id: string; first_name: string; last_name: string; matricule: string|null; position: string|null; category: string|null; marital_status: string; children_count: number; active: boolean; status: string; contract_type: string; client_id: string; client_name?: string; hire_date: string|null; gender: string }
interface Client { id: string; name: string }

const EMPTY_FORM = { first_name: '', last_name: '', matricule: '', position: '', category: '', marital_status: 'celibataire', children_count: 0, gender: 'M', status: 'actif', contract_type: 'cdi', hire_date: '', contract_end_date: '', phone: '', email: '', social_security_number: '', active: true, client_id: '' }

export default function Employees() {
  const { toasts, toast, dismiss } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      const [emps, cls] = await Promise.all([employeesApi.list(), clientsApi.list()])
      setEmployees(emps); setClients(cls)
    } catch {} finally { setLoading(false) }
  }

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM, client_id: clients[0]?.id || '' }); setShowForm(true) }
  const openEdit = (e: Employee) => { setEditing(e); setForm({ first_name: e.first_name, last_name: e.last_name, matricule: e.matricule||'', position: e.position||'', category: e.category||'', marital_status: e.marital_status, children_count: e.children_count, gender: e.gender, status: e.status, contract_type: e.contract_type, hire_date: '', contract_end_date: '', phone: '', email: '', social_security_number: '', active: e.active, client_id: e.client_id }); setShowForm(true) }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    try {
      if (editing) { await employeesApi.update(editing.id, form); toast('Employé mis à jour', 'success') }
      else { await employeesApi.create(form); toast('Employé créé', 'success') }
      setShowForm(false); fetchData()
    } catch (err: any) { toast(err.message, 'error') }
  }

  const handleDelete = async () => {
    if (!deleting) return
    await employeesApi.delete(deleting.id)
    setDeleting(null); toast('Employé supprimé', 'info'); fetchData()
  }

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || (e.matricule||'').toLowerCase().includes(q)
    const matchClient = !filterClient || e.client_id === filterClient
    return matchSearch && matchClient
  })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>

  return (
    <div className="space-y-6 page-enter">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <ConfirmModal open={!!deleting} title="Supprimer cet employé" message={`Supprimer "${deleting?.first_name} ${deleting?.last_name}" ?`} confirmLabel="Supprimer" danger onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-black text-slate-900">Employés</h1><p className="text-slate-500 mt-1">{employees.length} salarié{employees.length > 1 ? 's' : ''}</p></div>
        <button onClick={openCreate} className="btn-primary" disabled={!clients.length}><Plus className="w-4 h-4" /> Nouvel employé</button>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} className="input pl-10" placeholder="Rechercher..." /></div>
        <div className="relative min-w-48"><Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="input pl-10">
            <option value="">Tous les clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="card p-12 text-center"><Users className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-500">Aucun employé.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Employé</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Client</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Poste</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Situation</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Statut</th>
              <th className="py-3 px-4"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4">
                    <Link to={`/employees/${emp.id}`} className="flex items-center gap-3 hover:text-primary-600 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-medium flex-shrink-0">{emp.first_name[0]}{emp.last_name[0]}</div>
                      <div><p className="font-medium text-slate-900">{emp.first_name} {emp.last_name}</p>{emp.matricule && <p className="text-xs text-slate-400">Mat. {emp.matricule}</p>}</div>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{emp.client_name}</td>
                  <td className="py-3 px-4 text-slate-600">{emp.position||'—'}</td>
                  <td className="py-3 px-4 text-slate-600 capitalize">{emp.marital_status} · {emp.children_count} enf.</td>
                  <td className="py-3 px-4">{emp.active ? <span className="badge-success">Actif</span> : <span className="badge-error">Inactif</span>}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(emp)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleting(emp)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-bold text-slate-900">{editing ? 'Modifier l\'employé' : 'Nouvel employé'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-xl hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div><label className="label">Client *</label>
                <select required value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input">
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Prénom *</label><input required value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="input" /></div>
                <div><label className="label">Nom *</label><input required value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Matricule</label><input value={form.matricule} onChange={e => setForm({...form, matricule: e.target.value})} className="input" /></div>
                <div><label className="label">Genre</label>
                  <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="input">
                    <option value="M">Masculin</option><option value="F">Féminin</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Poste</label><input value={form.position} onChange={e => setForm({...form, position: e.target.value})} className="input" /></div>
                <div><label className="label">Catégorie</label><input value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Pôle</label><input value={(form as any).pole||''} onChange={e => setForm({...form, pole: e.target.value} as any)} className="input" placeholder="Ex: ADMIN, RH, FINANCE" /></div>
                <div><label className="label">Responsable</label><input value={(form as any).responsable||''} onChange={e => setForm({...form, responsable: e.target.value} as any)} className="input" placeholder="Nom du responsable" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Situation matrimoniale</label>
                  <select value={form.marital_status} onChange={e => setForm({...form, marital_status: e.target.value})} className="input">
                    <option value="celibataire">Célibataire</option>
                    <option value="marie">Marié(e)</option>
                    <option value="divorce">Divorcé(e)</option>
                    <option value="veuf">Veuf/Veuve</option>
                  </select>
                </div>
                <div><label className="label">Nb enfants</label><input type="number" min="0" value={form.children_count} onChange={e => setForm({...form, children_count: Number(e.target.value)})} className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Type contrat</label>
                  <select value={form.contract_type} onChange={e => setForm({...form, contract_type: e.target.value})} className="input">
                    <option value="cdi">CDI</option><option value="cdd">CDD</option><option value="stage">Stage</option>
                  </select>
                </div>
                <div><label className="label">Date d'embauche</label><input type="date" value={form.hire_date} onChange={e => setForm({...form, hire_date: e.target.value})} className="input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Téléphone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input" /></div>
                <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input" /></div>
              </div>
              <div><label className="label">N° CNSS</label><input value={form.social_security_number} onChange={e => setForm({...form, social_security_number: e.target.value})} className="input" /></div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <input type="checkbox" id="active" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} className="rounded" />
                <label htmlFor="active" className="text-sm font-medium text-slate-700">Employé actif</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Annuler</button>
                <button type="submit" className="btn-primary flex-1">{editing ? 'Mettre à jour' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
