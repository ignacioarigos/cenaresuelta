import { useState, useEffect } from 'react'
import { sb, fmt, fmtD, today, tipoBadge, TIPOS_GASTO } from '../lib/supabase'
import { useAuth } from '../components/Auth'
import { useToast } from '../components/Toast'

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hdr">
          <div className="modal-title">{title}</div>
          <button className="btn btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function GastoForm({ prefill, onSave, onClose, isEdit, gastoId }) {
  const { user } = useAuth()
  const toast = useToast()
  const UNIDADES = ['kg', 'g', 'L', 'ml', 'Unidad', 'Pack', 'Docena']
  const [form, setForm] = useState({
    fecha: prefill?.fecha || today(),
    material: prefill?.material || '',
    unidad: prefill?.unidad || 'kg',
    precio_unitario: prefill?.precio_unitario || '',
    cantidad: prefill?.cantidad || '',
    pagado_por: prefill?.pagado_por || 'Socci',
    tipo: prefill?.tipo || 'Comestibles',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.material || !form.precio_unitario || !form.cantidad) { toast('Completá todos los campos', 'err'); return }
    setSaving(true)
    const payload = { ...form, precio_unitario: parseFloat(form.precio_unitario), cantidad: parseFloat(form.cantidad) }
    let error
    if (isEdit) {
      ({ error } = await sb.from('gastos').update(payload).eq('id', gastoId))
    } else {
      ({ error } = await sb.from('gastos').insert({ ...payload, creado_por: user.id }))
    }
    if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
    toast(isEdit ? 'Gasto actualizado' : 'Gasto registrado')
    onSave()
  }

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <>
      <div className="g2">
        <div className="fg"><label className="fl">Fecha *</label><input type="date" value={form.fecha} onChange={set('fecha')} /></div>
        <div className="fg"><label className="fl">Pagado por</label>
          <select value={form.pagado_por} onChange={set('pagado_por')}>
            <option value="Socci">Socci</option>
            <option value="Arigós">Arigós</option>
          </select>
        </div>
        <div className="fg"><label className="fl">Tipo</label>
          <select value={form.tipo} onChange={set('tipo')}>
            {TIPOS_GASTO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="fg"><label className="fl">Material *</label><input value={form.material} onChange={set('material')} placeholder="Nombre del material" /></div>
      <div className="g3">
        <div className="fg"><label className="fl">Unidad</label>
          <select value={form.unidad} onChange={set('unidad')}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
        </div>
        <div className="fg"><label className="fl">Precio/unidad *</label><input type="number" value={form.precio_unitario} onChange={set('precio_unitario')} placeholder="0" /></div>
        <div className="fg"><label className="fl">Cantidad *</label><input type="number" value={form.cantidad} onChange={set('cantidad')} placeholder="0" /></div>
      </div>
      {form.precio_unitario && form.cantidad && (
        <div style={{ textAlign: 'right', color: 'var(--accent2)', fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          Total: {fmt(form.precio_unitario * form.cantidad)}
        </div>
      )}
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar gasto'}
        </button>
      </div>
    </>
  )
}

export default function Gastos() {
  const toast = useToast()
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(today().slice(0, 7))
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await sb.from('gastos').select('*,profiles(nombre)')
      .gte('fecha', mes + '-01').lte('fecha', mes + '-31')
      .order('fecha', { ascending: false })
    setGastos(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [mes])

  const deleteGasto = async id => {
    if (!confirm('¿Eliminar este gasto?')) return
    await sb.from('gastos').delete().eq('id', id)
    toast('Gasto eliminado')
    load()
  }

  const openEdit = async id => {
    const { data } = await sb.from('gastos').select('*').eq('id', id).single()
    setModal({ mode: 'edit', data, id })
  }

  const filtrados = tipoFiltro === 'todos' ? gastos : gastos.filter(g => g.tipo === tipoFiltro)
  const total = filtrados.reduce((s, g) => s + (g.costo_total || 0), 0)
  const socci = gastos.filter(g => g.pagado_por === 'Socci').reduce((s, g) => s + (g.costo_total || 0), 0)
  const arigos = gastos.filter(g => g.pagado_por === 'Arigós').reduce((s, g) => s + (g.costo_total || 0), 0)
  const porTipo = TIPOS_GASTO.map(t => ({ tipo: t, total: gastos.filter(g => g.tipo === t).reduce((s, g) => s + (g.costo_total || 0), 0) })).filter(t => t.total > 0)

  if (loading) return <div className="loading">Cargando gastos...</div>

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Gastos</div><div className="page-sub">Total del mes: {fmt(gastos.reduce((s, g) => s + (g.costo_total || 0), 0))}</div></div>
        <div className="flex gap2" style={{ flexWrap: 'wrap' }}>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>+ Nuevo gasto</button>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: `1fr 1fr${porTipo.length ? ' ' + porTipo.map(() => '1fr').join(' ') : ''}`, gap: 10, marginBottom: 16, overflowX: 'auto' }}>
        <div className="stat" style={{ padding: '14px 16px' }}><div className="stat-lbl">Pagado por Socci</div><div className="stat-val" style={{ fontSize: 18 }}>{fmt(socci)}</div></div>
        <div className="stat" style={{ padding: '14px 16px' }}><div className="stat-lbl">Pagado por Arigós</div><div className="stat-val" style={{ fontSize: 18 }}>{fmt(arigos)}</div></div>
        {porTipo.map(t => (
          <div key={t.tipo} className="stat" style={{ padding: '14px 16px' }}><div className="stat-lbl">{t.tipo}</div><div className="stat-val" style={{ fontSize: 16 }}>{fmt(t.total)}</div></div>
        ))}
      </div>

      {/* Filtros tipo */}
      <div className="flex gap2 filtros-wrap" style={{ marginBottom: 14 }}>
        {['todos', ...TIPOS_GASTO].map(t => (
          <button key={t} className={`btn btn-sm${tipoFiltro === t ? ' btn-primary' : ''}`} onClick={() => setTipoFiltro(t)}>
            {t === 'todos' ? 'Todos' : t}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="empty"><div className="empty-icon">🧾</div><div>No hay gastos en este período</div></div>
      ) : (
        <>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Material</th><th>Tipo</th><th>Unidad</th><th>Precio/u</th><th>Cant.</th><th>Total</th><th>Pagado por</th><th>Por</th><th></th></tr></thead>
              <tbody>
                {filtrados.map(g => (
                  <tr key={g.id}>
                    <td>{fmtD(g.fecha)}</td>
                    <td style={{ fontWeight: 500, color: 'var(--cream)' }}>{g.material}</td>
                    <td><span className={`badge ${tipoBadge(g.tipo)}`} style={{ fontSize: 10 }}>{g.tipo || 'Comestibles'}</span></td>
                    <td style={{ color: 'var(--text2)' }}>{g.unidad}</td>
                    <td>{fmt(g.precio_unitario)}</td>
                    <td>{g.cantidad}</td>
                    <td style={{ fontWeight: 500 }}>{fmt(g.costo_total)}</td>
                    <td><span className={`badge ${g.pagado_por === 'Socci' ? 'bb' : 'ba'}`}>{g.pagado_por || '-'}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{g.profiles?.nombre || '-'}</td>
                    <td><div className="flex gap2">
                      <button className="btn btn-sm" onClick={() => openEdit(g.id)}>✏</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteGasto(g.id)}>✕</button>
                    </div></td>
                  </tr>
                ))}
                <tr>
                  <td colSpan="6" style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text2)' }}>TOTAL {tipoFiltro !== 'todos' ? tipoFiltro : ''}</td>
                  <td colSpan="4" style={{ fontWeight: 600, color: 'var(--accent2)', fontSize: 15 }}>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mobile-list">
            {filtrados.map(g => (
              <div key={g.id} className="m-card">
                <div className="m-card-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="m-card-title">{g.material}</div>
                    <div className="m-card-sub">{fmtD(g.fecha)} · {g.cantidad} {g.unidad}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{fmt(g.costo_total)}</div>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                      <span className={`badge ${g.pagado_por === 'Socci' ? 'bb' : 'ba'}`} style={{ fontSize: 10 }}>{g.pagado_por}</span>
                      <span className={`badge ${tipoBadge(g.tipo)}`} style={{ fontSize: 10 }}>{g.tipo || 'Comestibles'}</span>
                    </div>
                  </div>
                </div>
                <div className="m-card-actions">
                  <button className="btn btn-sm" onClick={() => openEdit(g.id)}>✏ Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteGasto(g.id)} style={{ marginLeft: 'auto' }}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <Modal title={modal.mode === 'edit' ? 'Editar gasto' : 'Nuevo gasto'} onClose={() => setModal(null)}>
          <GastoForm
            prefill={modal.data}
            isEdit={modal.mode === 'edit'}
            gastoId={modal.id}
            onSave={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}
