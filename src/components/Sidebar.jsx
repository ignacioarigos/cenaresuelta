import { useAuth } from './Auth'
import { initials } from '../lib/supabase'

const SECTIONS = [
  { id: 'dashboard', icon: '🏠', label: 'Inicio' },
  { id: 'pedidos',   icon: '📦', label: 'Pedidos' },
  { id: 'reservas',  icon: '📅', label: 'Reservas' },
  { id: 'gastos',    icon: '🧾', label: 'Gastos' },
  { id: 'recetas',   icon: '🍽', label: 'Recetas' },
  { id: 'combos',    icon: '📦', label: 'Combos' },
  { id: 'costos',    icon: '📊', label: 'Costos' },
  { id: 'usuarios',  icon: '👥', label: 'Usuarios' },
]

export default function Sidebar({ current, onNavigate }) {
  const { profile, logout } = useAuth()
  const nombre = profile?.nombre || ''

  return (
    <nav className="sidebar">
      <div className="sb-logo">
        <div className="logo-t">Cena Resuelta</div>
        <div className="logo-s">CRM · v2.0</div>
      </div>
      <div className="sb-nav">
        {SECTIONS.map(s => (
          <div
            key={s.id}
            className={`nav-item${current === s.id ? ' active' : ''}`}
            onClick={() => onNavigate(s.id)}
          >
            <span className="nav-icon">{s.icon}</span>
            <span className="nav-label">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="sb-footer">
        <div className="user-pill" onClick={logout} title="Cerrar sesión">
          <div className="avatar">{initials(nombre)}</div>
          <div>
            <div className="u-name">{nombre}</div>
            <div className="u-role">{profile?.rol || 'usuario'} · salir</div>
          </div>
        </div>
      </div>
    </nav>
  )
}
