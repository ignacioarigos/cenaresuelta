import { useState, useEffect } from 'react'
import { sb, fmt, fmtD, estadoBadge } from '../lib/supabase'

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const [pr, rr, gr, ingr] = await Promise.all([
      sb.from('pedidos').select('*,pedido_items(subtotal)').order('created_at', { ascending: false }).limit(8),
      sb.from('reservas').select('*').order('fecha_entrega', { ascending: true }).limit(8),
      sb.from('gastos').select('costo_total').gte('fecha', mesInicio),
      sb.from('pedidos').select('pedido_items(subtotal)').eq('estado', 'entregado').gte('fecha_entrega', mesInicio)
    ])
    setData({
      pedidos: pr.data || [],
      reservas: rr.data || [],
      gastos: gr.data || [],
      entregados: ingr.data || []
    })
  }

  if (!data) return <div className="loading">Cargando...</div>

  const { pedidos, reservas, gastos, entregados } = data
  const activos = pedidos.filter(p => !['entregado', 'cancelado'].includes(p.estado)).length
  const enPrep = pedidos.filter(p => p.estado === 'en preparación').length
  const reservasActivas = reservas.filter(r => r.estado !== 'cancelada').length
  const totalGastos = gastos.reduce((s, g) => s + (g.costo_total || 0), 0)
  const totalIngresos = entregados.reduce((s, p) => s + (p.pedido_items || []).reduce((a, i) => a + (i.subtotal || 0), 0), 0)
  const balance = totalIngresos - totalGastos
  const balancePct = totalIngresos > 0 ? Math.min((totalIngresos / (totalIngresos + totalGastos)) * 100, 100) : 0

  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const dia = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  const proximasEntregas = [
    ...pedidos.filter(p => p.fecha_entrega && !['entregado', 'cancelado'].includes(p.estado)).map(p => ({
      tipo: 'pedido', cliente: p.cliente, fecha: p.fecha_entrega, estado: p.estado,
      total: (p.pedido_items || []).reduce((s, i) => s + (i.subtotal || 0), 0)
    })),
    ...reservas.filter(r => r.fecha_entrega && r.estado !== 'cancelada').map(r => ({
      tipo: 'reserva', cliente: r.cliente, fecha: r.fecha_entrega, estado: r.estado, desc: r.descripcion
    }))
  ].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6)

  return (
    <div className="page" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">{saludo} 👋</div>
          <div className="page-sub" style={{ textTransform: 'capitalize' }}>{dia}</div>
        </div>
        <div className="flex gap2">
          <button className="btn btn-sm" onClick={() => onNavigate('pedidos')}>+ Pedido</button>
          <button className="btn btn-sm btn-primary" onClick={() => onNavigate('reservas')}>+ Reserva</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }} className="stats-row">
        <div className="stat" style={{ padding: '14px 16px' }}>
          <div className="stat-lbl">Pedidos activos</div>
          <div className="stat-val" style={{ fontSize: 28 }}>{activos}</div>
          <div className="stat-meta">{enPrep} en preparación</div>
        </div>
        <div className="stat" style={{ padding: '14px 16px' }}>
          <div className="stat-lbl">Reservas</div>
          <div className="stat-val" style={{ fontSize: 28 }}>{reservasActivas}</div>
          <div className="stat-meta">activas</div>
        </div>
        <div className="stat" style={{ padding: '14px 16px' }}>
          <div className="stat-lbl">Ingresos del mes</div>
          <div className="stat-val" style={{ fontSize: 18, color: 'var(--green2)' }}>{fmt(totalIngresos)}</div>
          <div className="stat-meta">pedidos entregados</div>
        </div>
        <div className="stat" style={{ padding: '14px 16px' }}>
          <div className="stat-lbl">Gastos del mes</div>
          <div className="stat-val" style={{ fontSize: 18, color: 'var(--red2)' }}>{fmt(totalGastos)}</div>
          <div className="stat-meta">compras y servicios</div>
        </div>
        <div className="stat" style={{ padding: '14px 16px', gridColumn: 'span 2' }}>
          <div className="stat-lbl">Balance del mes</div>
          <div className="stat-val" style={{ fontSize: 22, color: balance >= 0 ? 'var(--green2)' : 'var(--red2)' }}>{fmt(balance)}</div>
          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${balancePct.toFixed(1)}%`, background: 'var(--green2)', borderRadius: 2 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--green2)' }}>ingresos {totalIngresos > 0 ? Math.round(balancePct) + '%' : ''}</div>
            <div style={{ fontSize: 10, color: 'var(--red2)' }}>gastos {totalGastos > 0 ? Math.round(100 - balancePct) + '%' : ''}</div>
          </div>
        </div>
      </div>

      {/* 3 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }} className="dash-cols">
        <div className="card" style={{ padding: 16 }}>
          <div className="flex gap2" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Pedidos recientes</div>
            <button className="btn btn-sm mla" onClick={() => onNavigate('pedidos')} style={{ fontSize: 11, padding: '3px 8px' }}>ver todos</button>
          </div>
          {pedidos.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin pedidos aún</div> :
            pedidos.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: 'var(--cream)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Entrega: {fmtD(p.fecha_entrega)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cream)' }}>{fmt((p.pedido_items || []).reduce((s, i) => s + (i.subtotal || 0), 0))}</div>
                  <span className={`badge ${estadoBadge(p.estado)}`} style={{ marginTop: 3 }}>{p.estado}</span>
                </div>
              </div>
            ))}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="flex gap2" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Reservas</div>
            <button className="btn btn-sm mla" onClick={() => onNavigate('reservas')} style={{ fontSize: 11, padding: '3px 8px' }}>ver todas</button>
          </div>
          {reservas.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin reservas aún</div> :
            reservas.slice(0, 5).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: 'var(--cream)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.cliente}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.descripcion}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: r.fecha_entrega ? 'var(--text3)' : 'var(--accent2)' }}>{r.fecha_entrega ? fmtD(r.fecha_entrega) : 'Sin fecha ✎'}</div>
                  <span className={`badge ${estadoBadge(r.estado)}`} style={{ marginTop: 3 }}>{r.estado}</span>
                </div>
              </div>
            ))}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="flex gap2" style={{ marginBottom: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Próximas entregas</div>
          </div>
          {proximasEntregas.length === 0
            ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Sin entregas próximas</div>
            : proximasEntregas.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: e.tipo === 'reserva' ? 'rgba(200,135,58,.15)' : 'rgba(61,111,163,.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: e.tipo === 'reserva' ? 'var(--accent2)' : 'var(--blue2)' }}>{new Date(e.fecha + 'T12:00:00').getDate()}</div>
                  <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase' }}>{new Date(e.fecha + 'T12:00:00').toLocaleString('es-AR', { month: 'short' })}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: 'var(--cream)', fontSize: 13 }}>{e.cliente}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.tipo === 'reserva' ? e.desc : fmt(e.total)}</div>
                </div>
                <span className={`badge ${e.tipo === 'reserva' ? 'ba' : 'bb'}`}>{e.tipo}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
