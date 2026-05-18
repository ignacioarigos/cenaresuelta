import { useState, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './components/Auth'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import './index.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Pedidos   = lazy(() => import('./pages/Pedidos'))
const Reservas  = lazy(() => import('./pages/Reservas'))
const Gastos    = lazy(() => import('./pages/Gastos'))
const Recetas   = lazy(() => import('./pages/Recetas'))
const Combos   = lazy(() => import('./pages/Combos'))
const Usuarios  = lazy(() => import('./pages/Usuarios'))

function AppShell() {
  const { user, loading } = useAuth()
  const [section, setSection] = useState('dashboard')

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text3)', fontFamily: 'DM Sans,sans-serif' }}>Cargando...</div>
  if (!user) return <Login />

  const Page = { dashboard: Dashboard, pedidos: Pedidos, reservas: Reservas, gastos: Gastos, recetas: Recetas, combos: Combos, costos: Costos, usuarios: Usuarios }[section] || Dashboard

  return (
    <div id="app">
      <Sidebar current={section} onNavigate={setSection} />
      <main className="main">
        <Suspense fallback={<div className="loading">Cargando...</div>}>
          <Page onNavigate={setSection} />
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  )
}
