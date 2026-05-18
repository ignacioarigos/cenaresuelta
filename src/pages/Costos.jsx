import { useState, useEffect } from 'react'
import { sb, fmt, fmtD, today } from '../lib/supabase'

export default function Costos() {
  const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const [desde, setDesde] = useState(mesInicio)
  const [hasta, setHasta] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})

  const calcular = async () => {
    setLoading(true)
    setData(null)

    const { data: pedidosData } = await sb
      .from('pedidos')
      .select('id,cliente,fecha_entrega,pedido_items(cantidad,sku,receta_id,subtotal)')
      .eq('estado', 'entregado')
      .gte('fecha_entrega', desde)
      .lte('fecha_entrega', hasta)

    const pedidos = pedidosData || []
    const vendidosPorReceta = {}
    pedidos.forEach(p => {
      (p.pedido_items || []).forEach(item => {
        if (!item.receta_id) return
        if (!vendidosPorReceta[item.receta_id])
          vendidosPorReceta[item.receta_id] = { sku: item.sku, cantidad: 0, ingresos: 0 }
        vendidosPorReceta[item.receta_id].cantidad += item.cantidad || 0
        vendidosPorReceta[item.receta_id].ingresos += item.subtotal || 0
      })
    })

    const recetaIds = Object.keys(vendidosPorReceta)
    if (recetaIds.length === 0) { setData({ empty: true }); setLoading(false); return }

    const [recetasRes, matsRes, mobsRes, otrosRes] = await Promise.all([
      sb.from('recetas').select('*').in('id', recetaIds),
      sb.from('receta_materiales').select('*').in('receta_id', recetaIds).order('orden'),
      sb.from('receta_mano_obra').select('*').in('receta_id', recetaIds).order('orden'),
      sb.from('receta_otros').select('*').in('receta_id', recetaIds).order('orden'),
    ])

    const recetasMap = {}
    ;(recetasRes.data || []).forEach(r => { recetasMap[r.id] = r })
    const matsMap = {}, mobsMap = {}, otrosMap = {}
    ;(matsRes.data || []).forEach(m => { if (!matsMap[m.receta_id]) matsMap[m.receta_id] = []; matsMap[m.receta_id].push(m) })
    ;(mobsRes.data || []).forEach(m => { if (!mobsMap[m.receta_id]) mobsMap[m.receta_id] = []; mobsMap[m.receta_id].push(m) })
    ;(otrosRes.data || []).forEach(o => { if (!otrosMap[o.receta_id]) otrosMap[o.receta_id] = []; otrosMap[o.receta_id].push(o) })

    const items = recetaIds.map(rid => {
      const r = recetasMap[rid]
      if (!r) return null
      const vendido = vendidosPorReceta[rid]
      const qty = vendido.cantidad
      const ingresos = vendido.ingresos
      const divisor = r.porciones > 1 ? r.porciones : 1

      const costMatU = r.costo_materiales || 0
      const costMobU = r.costo_mano_obra || 0
      const costOtrosU = r.otros_costos || 0
      const costTotalU = r.costo_total || (costMatU + costMobU + costOtrosU)

      const mats = (matsMap[rid] || []).map(m => ({
        nombre: m.nombre, unidad: m.unidad,
        cant_u: m.cantidad / divisor,
        cant_total: (m.cantidad / divisor) * qty,
        precio_u: m.precio_unidad,
        costo_u: m.precio_unidad * (m.cantidad / divisor),
        costo_total: m.precio_unidad * (m.cantidad / divisor) * qty,
      }))
      const mobs = (mobsMap[rid] || []).map(m => ({
        actividad: m.actividad,
        minutos_u: m.minutos / divisor,
        minutos_total: (m.minutos / divisor) * qty,
        costo_u: m.tarifa_hora * ((m.minutos / divisor) / 60),
        costo_total: m.tarifa_hora * ((m.minutos / divisor) / 60) * qty,
      }))
      const otros = (otrosMap[rid] || []).map(o => ({
        item: o.item,
        costo_u: o.costo * o.cantidad,
        costo_total: o.costo * o.cantidad * qty,
      }))

      return {
        id: rid, nombre: r.nombre, sku: r.sku, qty, ingresos,
        costMatTotal: costMatU * qty, costMobTotal: costMobU * qty,
        costOtrosTotal: costOtrosU * qty, costTotal: costTotalU * qty,
        ganancia: ingresos - costTotalU * qty,
        mats, mobs, otros
      }
    }).filter(Boolean)

    const totalIngresos = items.reduce((s, i) => s + i.ingresos, 0)
    const totalCosto = items.reduce((s, i) => s + i.costTotal, 0)
    const totalUnidades = items.reduce((s, i) => s + i.qty, 0)
    setData({ items, totalIngresos, totalCosto, totalUnidades })
    setLoading(false)
  }

  useEffect(() => { calcular() }, [])

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Costos de Producción</div><div className="page-sub">Consumo real basado en pedidos entregados</div></div>
      </div>

      {/* Filtro fechas */}
      <div className="flex gap2" style={{ marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <button className="btn btn-primary" onClick={calcular} disabled={loading}>
          {loading ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {loading && <div className="loading">Calculando costos...</div>}

      {data?.empty && (
        <div className="empty"><div className="empty-icon">📊</div><div>No hay pedidos entregados en este período</div></div>
      )}

      {data && !data.empty && (
        <>
          {/* Resumen global */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
            <div className="stat" style={{ padding: '14px 16px' }}>
              <div className="stat-lbl">Unidades vendidas</div>
              <div className="stat-val">{data.totalUnidades}</div>
              <div className="stat-meta">{data.items.length} receta{data.items.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="stat" style={{ padding: '14px 16px' }}>
              <div className="stat-lbl">Ingresos</div>
              <div className="stat-val" style={{ fontSize: 18, color: 'var(--green2)' }}>{fmt(data.totalIngresos)}</div>
              <div className="stat-meta">pedidos entregados</div>
            </div>
            <div className="stat" style={{ padding: '14px 16px' }}>
              <div className="stat-lbl">Costo de producción</div>
              <div className="stat-val" style={{ fontSize: 18, color: 'var(--red2)' }}>{fmt(data.totalCosto)}</div>
              <div className="stat-meta">ingredientes + labor</div>
            </div>
            <div className="stat" style={{ padding: '14px 16px' }}>
              <div className="stat-lbl">Ganancia bruta</div>
              <div className="stat-val" style={{ fontSize: 18, color: data.totalIngresos - data.totalCosto >= 0 ? 'var(--accent2)' : 'var(--red2)' }}>
                {fmt(data.totalIngresos - data.totalCosto)}
              </div>
            </div>
          </div>

          {/* Cards por receta */}
          {data.items.map(item => (
            <div key={item.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: 'var(--cream)' }}>{item.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>SKU: {item.sku} · <strong style={{ color: 'var(--cream)' }}>{item.qty}</strong> porción{item.qty !== 1 ? 'es' : ''} vendida{item.qty !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['Ingresos', item.ingresos, 'var(--green2)'], ['Costo', item.costTotal, 'var(--red2)'], ['Ganancia', item.ganancia, item.ganancia >= 0 ? 'var(--accent2)' : 'var(--red2)']].map(([lbl, val, color]) => (
                    <div key={lbl} style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{lbl}</div>
                      <div style={{ fontWeight: 600, color }}>{fmt(val)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumen costos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 10 }}>
                {[['Materiales', item.costMatTotal], ['Mano obra', item.costMobTotal], ['Otros', item.costOtrosTotal], ['Total', item.costTotal]].map(([lbl, val]) => (
                  <div key={lbl} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{lbl}</div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--cream)' }}>{fmt(val)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{fmt(val / item.qty)}/u</div>
                  </div>
                ))}
              </div>

              <button className="btn btn-sm" onClick={() => toggle(item.id)} style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
                {expanded[item.id] ? 'Ocultar detalle ▴' : 'Ver detalle de ingredientes ▾'}
              </button>

              {expanded[item.id] && (
                <div>
                  {item.mats.length > 0 && (
                    <>
                      <div className="card-title" style={{ marginBottom: 6 }}>Materiales</div>
                      <div style={{ overflowX: 'auto', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 10 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: 'var(--surface2)' }}>
                            {['Ingrediente', 'Cant/u', 'Cant total', 'Precio/u', 'Costo/u', 'Costo total'].map(h => (
                              <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Ingrediente' ? 'left' : 'right', color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {item.mats.map((m, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '7px 10px', color: 'var(--cream)' }}>{m.nombre} <span style={{ color: 'var(--text3)' }}>({m.unidad})</span></td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{m.cant_u.toFixed(4)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{m.cant_total.toFixed(4)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{fmt(m.precio_u)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{fmt(m.costo_u)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--cream)' }}>{fmt(m.costo_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {item.mobs.length > 0 && (
                    <>
                      <div className="card-title" style={{ marginBottom: 6 }}>Mano de Obra</div>
                      <div style={{ overflowX: 'auto', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 10 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: 'var(--surface2)' }}>
                            {['Actividad', 'Min/u', 'Min total', 'Costo/u', 'Costo total'].map(h => (
                              <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Actividad' ? 'left' : 'right', color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {item.mobs.map((m, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '7px 10px', color: 'var(--cream)' }}>{m.actividad}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{m.minutos_u.toFixed(1)} min</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{m.minutos_total.toFixed(1)} min</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{fmt(m.costo_u)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--cream)' }}>{fmt(m.costo_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {item.otros.length > 0 && (
                    <>
                      <div className="card-title" style={{ marginBottom: 6 }}>Otros Costos</div>
                      <div style={{ overflowX: 'auto', borderRadius: 'var(--r)', border: '1px solid var(--border)', marginBottom: 10 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: 'var(--surface2)' }}>
                            {['Item', 'Costo/u', 'Costo total'].map(h => (
                              <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Item' ? 'left' : 'right', color: 'var(--text3)', fontWeight: 500 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {item.otros.map((o, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '7px 10px', color: 'var(--cream)' }}>{o.item}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text2)' }}>{fmt(o.costo_u)}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500, color: 'var(--cream)' }}>{fmt(o.costo_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
