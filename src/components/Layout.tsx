import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Building2, Users, Grid3x3, CalendarClock,
  LogOut, Menu, Calculator, Download, FlaskConical, X, ChevronRight,
  Activity, Settings2
} from 'lucide-react'
import { AIChatbot } from './AIChatbot'
import { NotificationBadge } from './NotificationBadge'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

const navItems = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: Building2 },
  { to: '/employees', label: 'Employés', icon: Users },
  { to: '/salary-grids', label: 'Grilles salariales', icon: Grid3x3 },
  { to: '/payroll', label: 'Périodes de paie', icon: CalendarClock },
  { to: '/simulator', label: 'Simulateur', icon: FlaskConical },
  { to: '/export', label: 'Export & Rapports', icon: Download },
  { to: '/activity', label: 'Journal activité', icon: Activity },
  { to: '/settings', label: 'Paramètres', icon: Settings2 },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { org, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useKeyboardShortcuts()

  const handleSignOut = async () => { await signOut(); navigate('/auth') }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-30 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 flex flex-col transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: 'linear-gradient(180deg, #0f1629 0%, #141e38 100%)' }}>

        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center shadow-glow-sm">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-white tracking-tight">ObedPaie</h1>
              <p className="text-[10px] text-slate-400 font-medium">Gestion de paie · Togo</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:bg-white/8 hover:text-white'
                }`
              }>
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 ${isActive ? 'bg-primary-500 shadow-glow-sm' : 'bg-white/5 group-hover:bg-white/10'}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="flex-1">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-primary-300" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Raccourcis clavier hint */}
        <div className="px-4 py-2 border-t border-white/5">
          <p className="text-[9px] text-slate-600 leading-relaxed">
            Ctrl+K Employés · Ctrl+N Paie · Ctrl+D Accueil
          </p>
        </div>

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <div className="px-3 py-2.5 rounded-xl bg-white/5">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Cabinet</p>
            <p className="text-sm font-semibold text-white truncate mt-0.5">{org?.name || '—'}</p>
          </div>
          <button onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/20 hover:text-red-300 transition-all w-full">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
              <Calculator className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-slate-900">ObedPaie</span>
          </div>
          {/* Spacer desktop */}
          <div className="hidden lg:block flex-1" />
          <div className="flex items-center gap-2">
            <NotificationBadge />
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 page-enter overflow-auto">{children}</main>
      </div>

      <AIChatbot />
    </div>
  )
}
