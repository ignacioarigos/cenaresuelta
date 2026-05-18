import { createClient } from '@supabase/supabase-js'

export const sb = createClient(
  'https://hdwwsfszaqeohmaoesji.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhkd3dzZnN6YXFlb2htYW9lc2ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzA2NDEsImV4cCI6MjA5Mzc0NjY0MX0.VHTvnBsi0niAnWCMPXq0ek9It0zHh6IxQevNquwp1Rc'
)

export const fmt = n =>
  '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export const fmtD = d =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'

export const today = () => new Date().toISOString().split('T')[0]

export const initials = n =>
  n ? n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?'

export const estadoBadge = e => ({
  pendiente: 'ba', 'en preparación': 'bb', listo: 'bg',
  entregado: 'bgr', cancelado: 'br', confirmada: 'bg', cancelada: 'br'
}[e] || 'bgr')

export const ESTADOS_P = ['pendiente', 'en preparación', 'listo', 'entregado', 'cancelado']
export const ESTADOS_R = ['confirmada', 'pendiente', 'cancelada']
export const TIPOS_GASTO = ['Comestibles', 'Consumibles', 'Packaging', 'Servicios', 'Otros']
export const tipoBadge = t => ({ Comestibles: 'bg', Packaging: 'ba', Servicios: 'bb', Consumibles: 'bgr', Otros: 'br' }[t] || 'bgr')
