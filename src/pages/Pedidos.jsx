import { useState, useEffect } from 'react'
import { sb, fmt, fmtD, today, ESTADOS_P } from '../lib/supabase'
import { useAuth } from '../components/Auth'
import { useToast } from '../components/Toast'

function Modal({ title, onClose, children, maxWidth = 600 }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-hdr">
          <div className="modal-title">{title}</div>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function PedidoForm({ recetas, combos, prefill, onSave, onClose, isEdit, pedidoId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    cliente: prefill?.cliente || '',
    fecha_pedido: prefill?.fecha_pedido || today(),
    fecha_entrega: prefill?.fecha_entrega || '',
    estado: prefill?.estado || 'pendiente',
    notas: prefill?.notas || '',
  })
  const [items, setItems] = useState(prefill?.items || [])
  const [gastos, setGastos] = useState(prefill?.gastos || [])
  const [gastosExistentes, setGastosExistentes] = useState([])
  const [tabGastos, setTabGastos] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load recent gastos for linking
    sb.from('gastos').select('*').order('fecha', { ascending: false }).limit(50)
      .then(({ data }) => setGastosExistentes(data || []))
  }, [])

  const totalItems = items.reduce((s, i) => s + (parseFloat(i.cantidad || 0) * parseFloat(i.precio || 0)), 0)
  const totalGastos = gastos.reduce((s, g) => s + (parseFloat(g.monto || 0)), 0)
  const ganancia = totalItems - totalGastos

  const addPlato = () => setItems([...items, { tipo: 'plato', receta_id: '', sku: '', cantidad: 1, precio: 0 }])
  const addCombo = () => setItems([...items, { tipo: 'combo', combo_id: '', nombre: '', cantidad: 1, precio: 0, es_combo: true }])

  const updateItem = (i, field, val, sel) => {
    const n = [...items]
    if (field === 'receta_id' && sel) {
      const opt = sel.options[sel.selectedIndex]
      n[i] = { ...n[i], receta_id: val, sku: opt.dataset.sku || '', precio: parseFloat(opt.dataset.precio || 0) }
    } else if (field === 'combo_id' && sel) {
      const opt = sel.options[sel.selectedIndex]
      n[i] = { ...n[i], combo_id: val, nombre: opt.dataset.nombre || '', precio: parseFloat(opt.dataset.precio || 0) }
    } else {
      n[i] = { ...n[i], [field]: val }
    }
    setItems(n)
  }

  const addGastoExistente = gasto => {
    if (gastos.find(g => g.gasto_id === gasto.id)) { toast('Este gasto ya está agregado', 'err'); return }
    setGastos([...gastos, { gasto_id: gasto.id, descripcion: gasto.material, monto: gasto.costo_total, es_gasto_existente: true }])
  }

  const addGastoManual = () => setGastos([...gastos, { gasto_id: null, descripcion: '', monto: 0, es_gasto_existente: false }])

  const save = async () => {
    if (!form.cliente || items.length === 0) { toast('Completá cliente y al menos un plato', 'err'); return }
    setSaving(true)

    if (isEdit) {
      await sb.from('pedidos').update({ ...form, fecha_entrega: form.fecha_entrega || null, updated_at: new Date().toISOString() }).eq('id', pedidoId)
      await sb.from('pedido_items').delete().eq('pedido_id', pedidoId)
      await sb.from('pedido_gastos').delete().eq('pedido_id', pedidoId)
    } else {
      const { data: ped, error } = await sb.from('pedidos').insert({
        ...form, fecha_entrega: form.fecha_entrega || null, creado_por: user.id
      }).select().single()
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      pedidoId = ped.id
      if (prefill?.reserva_id) await sb.from('reservas').update({ estado: 'cancelada' }).eq('id', prefill.reserva_id)
    }

    // Insert items (platos y combos)
    const itemsToInsert = items.filter(i => i.tipo === 'plato' ? i.receta_id : i.combo_id).map(i => {
      if (i.tipo === 'combo') {
        return { pedido_id: pedidoId, receta_id: null, sku: i.nombre || 'COMBO', cantidad: parseInt(i.cantidad), precio_unitario: parseFloat(i.precio), es_combo: true, combo_id: parseInt(i.combo_id) }
      }
      return { pedido_id: pedidoId, receta_id: parseInt(i.receta_id), sku: i.sku, cantidad: parseInt(i.cantidad), precio_unitario: parseFloat(i.precio), es_combo: false }
    })
    if (itemsToInsert.length) await sb.from('pedido_items').insert(itemsToInsert)

    // Insert gastos asociados
    const gastosToInsert = gastos.filter(g => g.descripcion && g.monto).map(g => ({
      pedido_id: pedidoId, gasto_id: g.gasto_id || null,
      descripcion: g.descripcion, monto: parseFloat(g.monto),
      es_gasto_existente: g.es_gasto_existente || false,
      creado_por: user.id
    }))
    if (gastosToInsert.length) await sb.from('pedido_gastos').insert(gastosToInsert)

    toast(isEdit ? 'Pedido actualizado' : 'Pedido guardado')
    onSave()
  }

  return (
    <>
      {prefill?.reserva_id && (
        <div style={{ background: 'rgba(200,135,58,.1)', border: '1px solid rgba(200,135,58,.2)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--accent2)' }}>
          📅 Convertida desde reserva. Al guardar, la reserva se marcará como cancelada.
        </div>
      )}
      <div className="g2">
        <div className="fg"><label className="fl">Cliente *</label>
          <input value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} placeholder="Nombre del cliente" />
        </div>
        <div className="fg"><label className="fl">Estado</label>
          <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
            {ESTADOS_P.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Fecha del pedido</label>
          <input type="date" value={form.fecha_pedido} onChange={e => setForm(f => ({ ...f, fecha_pedido: e.target.value }))} />
        </div>
        <div className="fg"><label className="fl">Fecha de entrega</label>
          <input type="date" value={form.fecha_entrega} onChange={e => setForm(f => ({ ...f, fecha_entrega: e.target.value }))} />
        </div>
      </div>

      {/* Tabs Platos / Gastos */}
      <div className="flex gap2" style={{ marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        <button className={`btn btn-sm${!tabGastos ? ' btn-primary' : ''}`} onClick={() => setTabGastos(false)}>🍽 Platos y Combos</button>
        <button className={`btn btn-sm${tabGastos ? ' btn-primary' : ''}`} onClick={() => setTabGastos(true)}>
          🧾 Gastos asociados {gastos.length > 0 ? `(${gastos.length})` : ''}
        </button>
      </div>

      {!tabGastos ? (
        <>
          {/* Items */}
          {items.map((item, i) => (
            <div key={i} className="item-card" style={{ marginBottom: 8 }}>
              {item.tipo === 'combo' || item.es_combo ? (
                <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span className="badge ba" style={{ fontSize: 10 }}>📦 COMBO</span>
                  </div>
                  <div style={{ flex: 2, minWidth: 160 }}><label className="fl">Combo</label>
                    <select value={item.combo_id || ''} onChange={e => updateItem(i, 'combo_id', e.target.value, e.target)}>
                      <option value="">Seleccionar combo...</option>
                      {combos.map(c => <option key={c.id} value={c.id} data-precio={c.precio_combo} data-nombre={c.nombre}>{c.nombre} — {fmt(c.precio_combo)}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 75 }}><label className="fl">Cant.</label>
                    <input type="number" min="1" value={item.cantidad || 1} onChange={e => updateItem(i, 'cantidad', e.target.value)} />
                  </div>
                  <div style={{ width: 115 }}><label className="fl">Precio unit.</label>
                    <input type="number" value={item.precio || 0} onChange={e => updateItem(i, 'precio', e.target.value)} />
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ) : (
                <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2, minWidth: 160 }}><label className="fl">Plato</label>
                    <select value={item.receta_id || ''} onChange={e => updateItem(i, 'receta_id', e.target.value, e.target)}>
                      <option value="">Seleccionar plato...</option>
                      {recetas.map(r => <option key={r.id} value={r.id} data-precio={r.precio_venta} data-sku={r.sku}>{r.nombre} ({r.sku})</option>)}
                    </select>
                  </div>
                  <div style={{ width: 75 }}><label className="fl">Cant.</label>
                    <input type="number" min="1" value={item.cantidad || 1} onChange={e => updateItem(i, 'cantidad', e.target.value)} />
                  </div>
                  <div style={{ width: 115 }}><label className="fl">Precio unit.</label>
                    <input type="number" value={item.precio || 0} onChange={e => updateItem(i, 'precio', e.target.value)} />
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => setItems(items.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              )}
              {item.cantidad && item.precio ? (
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
                  Subtotal: {fmt(item.cantidad * item.precio)}
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex gap2" style={{ marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={addPlato}>+ Plato</button>
            {combos.length > 0 && <button className="btn btn-sm" onClick={addCombo}>+ Combo 📦</button>}
          </div>
          {items.length > 0 && (
            <div className="total-row"><span>Total</span><span style={{ color: 'var(--accent2)', fontSize: 18 }}>{fmt(totalItems)}</span></div>
          )}
        </>
      ) : (
        <>
          {/* Gastos asociados */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
              Asociá gastos ya registrados o cargá gastos específicos de este pedido
            </div>

            {/* Gastos cargados */}
            {gastos.map((g, i) => (
              <div key={i} className="item-card" style={{ marginBottom: 8 }}>
                <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {g.es_gasto_existente && <span className="badge bb" style={{ fontSize: 10, alignSelf: 'center' }}>del registro</span>}
                  <div style={{ flex: 2, minWidth: 140 }}><label className="fl">Descripción</label>
                    <input value={g.descripcion || ''} onChange={e => { const n = [...gastos]; n[i] = { ...n[i], descripcion: e.target.value }; setGastos(n) }} readOnly={g.es_gasto_existente} />
                  </div>
                  <div style={{ width: 120 }}><label className="fl">Monto ($)</label>
                    <input type="number" value={g.monto || 0} onChange={e => { const n = [...gastos]; n[i] = { ...n[i], monto: e.target.value }; setGastos(n) }} />
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => setGastos(gastos.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              </div>
            ))}

            <div className="flex gap2" style={{ marginBottom: 14 }}>
              <button className="btn btn-sm" onClick={addGastoManual}>+ Gasto manual</button>
            </div>

            {/* Gastos existentes para asignar */}
            {gastosExistentes.length > 0 && (
              <div>
                <div className="card-title" style={{ marginBottom: 8 }}>Asignar gasto del registro</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                  {gastosExistentes.map(g => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div>
                        <span style={{ color: 'var(--cream)', fontWeight: 500 }}>{g.material}</span>
                        <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{fmtD(g.fecha)}</span>
                      </div>
                      <div className="flex gap2">
                        <span style={{ color: 'var(--accent2)', fontWeight: 500 }}>{fmt(g.costo_total)}</span>
                        <button className="btn btn-sm" onClick={() => addGastoExistente(g)} style={{ fontSize: 11, padding: '2px 8px' }}>+ Asignar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resumen financiero */}
          {(totalItems > 0 || totalGastos > 0) && (
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>Ingresos (platos)</span>
                <span style={{ fontWeight: 500, color: 'var(--green2)' }}>{fmt(totalItems)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>Gastos asociados</span>
                <span style={{ fontWeight: 500, color: 'var(--red2)' }}>{fmt(totalGastos)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--cream)' }}>Ganancia estimada</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: ganancia >= 0 ? 'var(--accent2)' : 'var(--red2)' }}>{fmt(ganancia)}</span>
              </div>
            </div>
          )}
        </>
      )}

      <div className="fg" style={{ marginTop: 16 }}><label className="fl">Notas</label>
        <textarea rows="2" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar pedido'}
        </button>
      </div>
    </>
  )
}

export default function Pedidos() {
  const toast = useToast()
  const [pedidos, setPedidos] = useState([])
  const [recetas, setRecetas] = useState([])
  const [combos, setCombos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const [p, r, c] = await Promise.all([
      sb.from('pedidos').select('*,pedido_items(*),pedido_gastos(*),profiles(nombre)').order('created_at', { ascending: false }),
      sb.from('recetas').select('*').eq('activa', true),
      sb.from('combos').select('*').eq('activo', true)
    ])
    setPedidos(p.data || [])
    setRecetas(r.data || [])
    setCombos(c.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateEstado = async (id, estado) => {
    await sb.from('pedidos').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    toast('Estado actualizado')
    load()
  }

  const deletePedido = async id => {
    if (!confirm('¿Eliminar este pedido?')) return
    await sb.from('pedidos').delete().eq('id', id)
    toast('Pedido eliminado')
    load()
  }

  const openEdit = async id => {
    const [pr, ir, gr] = await Promise.all([
      sb.from('pedidos').select('*').eq('id', id).single(),
      sb.from('pedido_items').select('*').eq('pedido_id', id),
      sb.from('pedido_gastos').select('*').eq('pedido_id', id)
    ])
    const items = (ir.data || []).map(i => ({
      tipo: i.es_combo ? 'combo' : 'plato',
      receta_id: i.receta_id, combo_id: i.combo_id,
      sku: i.sku, nombre: i.sku,
      cantidad: i.cantidad, precio: i.precio_unitario,
      es_combo: i.es_combo
    }))
    const gastos = (gr.data || []).map(g => ({ ...g }))
    setModal({ mode: 'edit', data: { ...pr.data, items, gastos }, id })
  }

  const filtered = filtro === 'todos' ? pedidos : pedidos.filter(p => p.estado === filtro)

  if (loading) return <div className="loading">Cargando pedidos...</div>

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Pedidos</div><div className="page-sub">{pedidos.length} pedidos en total</div></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>+ Nuevo pedido</button>
      </div>

      <div className="flex gap2 filtros-wrap" style={{ marginBottom: 14 }}>
        {['todos', ...ESTADOS_P].map(e => (
          <button key={e} className={`btn btn-sm${filtro === e ? ' btn-primary' : ''}`} onClick={() => setFiltro(e)}>
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">📦</div><div>No hay pedidos</div></div>
        : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>#</th><th>Cliente</th><th>Pedido</th><th>Entrega</th><th>Platos</th><th>Total</th><th>Gastos</th><th>Ganancia</th><th>Estado</th><th>Por</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(p => {
                    const total = (p.pedido_items || []).reduce((s, i) => s + (i.subtotal || 0), 0)
                    const totalGastos = (p.pedido_gastos || []).reduce((s, g) => s + (g.monto || 0), 0)
                    const ganancia = total - totalGastos
                    const resumen = (p.pedido_items || []).map(i => `${i.cantidad}× ${i.sku}`).join(', ') || '-'
                    return (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--text3)', fontFamily: 'monospace' }}>#{p.id}</td>
                        <td style={{ fontWeight: 500, color: 'var(--cream)' }}>{p.cliente}</td>
                        <td>{fmtD(p.fecha_pedido)}</td>
                        <td>{fmtD(p.fecha_entrega)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{resumen}</td>
                        <td style={{ fontWeight: 500 }}>{fmt(total)}</td>
                        <td style={{ color: 'var(--red2)', fontSize: 12 }}>{totalGastos > 0 ? fmt(totalGastos) : '-'}</td>
                        <td style={{ fontWeight: 500, color: ganancia >= 0 ? 'var(--green2)' : 'var(--red2)' }}>{totalGastos > 0 ? fmt(ganancia) : '-'}</td>
                        <td>
                          <select value={p.estado} onChange={e => updateEstado(p.id, e.target.value)} style={{ width: 'auto', padding: '3px 8px', fontSize: 12 }}>
                            {ESTADOS_P.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.profiles?.nombre || '-'}</td>
                        <td><div className="flex gap2">
                          <button className="btn btn-sm" onClick={() => openEdit(p.id)}>✏</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deletePedido(p.id)}>✕</button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-list">
              {filtered.map(p => {
                const total = (p.pedido_items || []).reduce((s, i) => s + (i.subtotal || 0), 0)
                const totalGastos = (p.pedido_gastos || []).reduce((s, g) => s + (g.monto || 0), 0)
                const resumen = (p.pedido_items || []).map(i => `${i.cantidad}× ${i.sku}`).join(', ') || '-'
                return (
                  <div key={p.id} className="m-card">
                    <div className="m-card-row">
                      <div>
                        <div className="m-card-title">{p.cliente}</div>
                        <div className="m-card-sub">{resumen}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{fmt(total)}</div>
                        {totalGastos > 0 && <div style={{ fontSize: 11, color: 'var(--red2)' }}>Gastos: {fmt(totalGastos)}</div>}
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Entrega: {fmtD(p.fecha_entrega)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <select value={p.estado} onChange={e => updateEstado(p.id, e.target.value)} style={{ flex: 1, minWidth: 130, padding: '6px 10px', fontSize: 12 }}>
                        {ESTADOS_P.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                      <button className="btn btn-sm" onClick={() => openEdit(p.id)}>✏</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deletePedido(p.id)}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

      {modal && (
        <Modal title={modal.mode === 'edit' ? `Editar pedido #${modal.id}` : 'Nuevo pedido'} onClose={() => setModal(null)}>
          <PedidoForm
            recetas={recetas}
            combos={combos}
            prefill={modal.data}
            isEdit={modal.mode === 'edit'}
            pedidoId={modal.id}
            onSave={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}
