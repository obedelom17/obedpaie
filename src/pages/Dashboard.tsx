import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clientsApi, employeesApi, payrollApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Building2, Users, CalendarClock, TrendingUp, ArrowRight, Zap, AlertCircle, CheckCircle2, Clock, Rocket } from 'lucide-react'
import { CountUp } from '../components/ui/CountUp'
import { CardSkeleton } from '../components/ui/Skeleton'
import { formatXOF } from '../lib/payroll'
import { Onboarding } from '../components/Onboarding'

interface Stats { clientCount: number; employeeCount: number; openPeriods: number; closedPeriods: number; totalNetPay: number; totalEmployer: number }

export default function Dashboard() {
  const { org } = useAuth()
  const [stats, setStats] = useState<Stats>({ clientCount: 0, employeeCount: 0, openPeriods: 0, closedPeriods: 0, totalNetPay: 0, totalEmployer: 0 })
  const [recentPeriods, setRecentPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    try {
      const [clients, employees, periods] = await Promise.all([
        clientsApi.list(),
        employeesApi.list(),
        payrollApi.listPeriods(),
      ])
      const openPeriods = periods.filter((p: any) => p.status === 'open')
      const closedPeriods = periods.filter((p: any) => p.status === 'closed')
      // Agréger les variables de toutes les périodes (simplifié)
      let totalNet = 0, totalEmp = 0
      setStats({
        clientCount: clients.length,
        employeeCount: employees.filter((e: any) => e.active).length,
        openPeriods: openPeriods.length,
        closedPeriods: closedPeriods.length,
        totalNetPay: totalNet,
        totalEmployer: totalEmp,
      })
      setRecentPeriods(periods.slice(0, 5))
    } catch (e) { console.error('fetchStats error:', e) } finally { setLoading(false) }
  }

  if (loading) return <div className="space-y-6 page-enter"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}</div></div>

  const statCards = [
    { label: 'Clients', value: stats!.clientCount, icon: Building2, to: '/clients', grad: 'from-blue-500 to-primary-600', bg: 'from-blue-50 to-primary-50' },
    { label: 'Employés actifs', value: stats!.employeeCount, icon: Users, to: '/employees', grad: 'from-violet-500 to-accent-600', bg: 'from-violet-50 to-accent-50' },
    { label: 'Périodes ouvertes', value: stats!.openPeriods, icon: CalendarClock, to: '/payroll', grad: 'from-amber-500 to-orange-500', bg: 'from-amber-50 to-orange-50' },
    { label: 'Net à payer', value: stats!.totalNetPay, icon: TrendingUp, to: '/payroll', grad: 'from-emerald-500 to-teal-500', bg: 'from-emerald-50 to-teal-50', isMoney: true },
  ]

  return (
    <div className="space-y-8 page-enter">
      {showOnboarding && <Onboarding onDone={() => { setShowOnboarding(false); fetchStats() }} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Tableau de bord</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2"><span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse-soft inline-block"></span>{org?.name}</p>
        </div>
        <div className="flex gap-2">
          {stats!.clientCount === 0 && <button onClick={() => setShowOnboarding(true)} className="btn-secondary gap-2"><Rocket className="w-4 h-4" /> Démarrage rapide</button>}
          <Link to="/payroll" className="btn-primary gap-2 shadow-glow-sm"><Zap className="w-4 h-4" /> Traiter une paie</Link>
        </div>
      </div>

      {stats!.clientCount === 0 && (
        <div className="card p-6 border border-primary-200 bg-primary-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center"><Rocket className="w-6 h-6 text-primary-600" /></div>
            <div className="flex-1"><h3 className="font-bold text-slate-900">Bienvenue sur ElomPaie !</h3><p className="text-sm text-slate-500 mt-0.5">Commencez par créer un client, ajouter un employé, puis ouvrir une période de paie.</p></div>
            <button onClick={() => setShowOnboarding(true)} className="btn-primary">Démarrer <ArrowRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card, i) => (
          <Link key={card.label} to={card.to} className={`stat-card group hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 stagger-${i + 1}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${card.bg} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{card.label}</p>
                <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${card.grad} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}><card.icon className="w-5 h-5 text-white" /></div>
              </div>
              <p className="text-3xl font-black text-slate-900 tabular-nums">
                {card.isMoney ? formatXOF(card.value) : <CountUp value={card.value} />}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary-500" /> Périodes récentes</h2>
            <Link to="/payroll" className="text-sm text-primary-600 font-medium flex items-center gap-1">Tout voir <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {recentPeriods.length === 0
            ? <div className="text-center py-10 text-slate-400"><CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">Aucune période créée.</p></div>
            : <div className="space-y-2">{recentPeriods.map(p => (
                <Link key={p.id} to={`/payroll/${p.id}`} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p.status === 'open' ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                    {p.status === 'open' ? <Clock className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm group-hover:text-primary-600 transition-colors">
                      {new Date(p.period_year, p.period_month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-slate-500">{p.client_name}</p>
                  </div>
                  {p.status === 'open' ? <span className="badge-warning">Ouverte</span> : <span className="badge-success">Clôturée</span>}
                </Link>
              ))}</div>
          }
        </div>
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 mb-5 flex items-center gap-2"><Zap className="w-5 h-5 text-primary-500" /> Actions rapides</h2>
          <div className="space-y-2">
            {[
              { to: '/clients', icon: Building2, label: 'Nouveau client', sub: 'Ajouter une entreprise', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
              { to: '/employees', icon: Users, label: 'Nouvel employé', sub: 'Enregistrer un salarié', color: 'text-violet-600 bg-violet-50 hover:bg-violet-100' },
              { to: '/payroll', icon: CalendarClock, label: 'Nouvelle période', sub: 'Ouvrir un mois de paie', color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
              { to: '/activity', icon: Clock, label: 'Journal activité', sub: 'Voir les dernières actions', color: 'text-slate-600 bg-slate-50 hover:bg-slate-100' },
            ].map(item => (
              <Link key={item.to} to={item.to} className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group ${item.color}`}>
                <div className="w-9 h-9 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0"><item.icon className="w-4 h-4" /></div>
                <div className="flex-1"><p className="font-semibold text-sm">{item.label}</p><p className="text-xs opacity-70">{item.sub}</p></div>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4 border-l-4 border-l-primary-500 bg-primary-50/50">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div><p className="text-sm font-semibold text-primary-900">Conformité CGI OTR 2025</p><p className="text-xs text-primary-700 mt-0.5">CNSS 4%+17,5% · AMU 5%+5%</p></div>
        </div>
      </div>
    </div>
  )
}
