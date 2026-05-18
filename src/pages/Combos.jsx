import { useState, useEffect } from 'react'
import { sb, fmt } from '../lib/supabase'
import { useAuth } from '../components/Auth'
import { useToast } from '../components/Toast'

function ComboModal({ combo, items, recetas, onSave, onClose }) {
  const { user } = useAuth()
  const toast = useToast()
  const isNew = !combo

  const [nombre, setNombre] = useState(combo?.nombre || '')
  const [descripcion, setDescripcion] = useState(combo?.descripcion || '')
  const [precio, setPrecio] = useState(combo?.precio_combo || 0)
  const [lItems, setLItems] = useState(items.map(i => ({ ...i })))
  const [saving, setSaving] = useState(false)

  const precioIndividual = lItems.reduce((s, item) => {
    const receta = recetas.find(r => r.id === parseInt(item.receta_id))
    return s + (receta ? receta.precio_venta * (item.cantidad || 1) : 0)
  }, 0)
  const ahorro = precioIndividual - parseFloat(precio || 0)

  const save = async () => {
    if (!nombre || !precio) { toast('Completá nombre y precio', 'err'); return }
    if (lItems.filter(i => i.receta_id).length === 0) { toast('Agregá al menos un plato', 'err'); return }
    setSaving(true)

    const payload = { nombre, descripcion, precio_combo: parseFloat(precio), activo: true }
    let comboId = combo?.id

    if (isNew) {
      const { data, error } = await sb.from('combos').insert({ ...payload, creado_por: user.id }).select().single()
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      comboId = data.id
    } else {
      const { error } = await sb.from('combos').update(payload).eq('id', comboId)
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      await sb.from('combo_items').delete().eq('combo_id', comboId)
    }

    await sb.from('combo_items').insert(
      lItems.filter(i => i.receta_id).map(i => ({
        combo_id: comboId,
        receta_id: parseInt(i.receta_id),
        cantidad: parseInt(i.cantidad) || 1
      }))
    )

    toast(isNew ? 'Combo creado' : 'Combo actualizado')
    onSave()
  }

  const deleteCombo = async () => {
    if (!confirm('¿Eliminar este combo?')) return
    await sb.from('combos').update({ activo: false }).eq('id', combo.id)
    toast('Combo eliminado')
    onSave()
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-hdr">
          <div className="modal-title">{isNew ? 'Nuevo combo' : combo.nombre}</div>
          <div className="flex gap2">
            {!isNew && <button className="btn btn-sm btn-danger" onClick={deleteCombo}>Eliminar</button>}
            <button className="btn btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          <div className="fg"><label className="fl">Nombre del combo *</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Combo Familiar" />
          </div>
          <div className="fg"><label className="fl">Descripción</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción opcional" />
          </div>

          {/* Platos del combo */}
          <div style={{ marginBottom: 14 }}>
            <div className="flex gap2" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Platos incluidos</div>
              <button className="btn btn-sm mla" onClick={() => setLItems([...lItems, { receta_id: '', cantidad: 1 }])}>+ Plato</button>
            </div>
            {lItems.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>Sin platos — agregá al menos uno</div>
              : lItems.map((item, i) => {
                const receta = recetas.find(r => r.id === parseInt(item.receta_id))
                return (
                  <div key={i} className="item-card" style={{ marginBottom: 8 }}>
                    <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: 2, minWidth: 160 }}>
                        <label className="fl">Plato</label>
                        <select value={item.receta_id || ''} onChange={e => {
                          const n = [...lItems]; n[i] = { ...n[i], receta_id: e.target.value }; setLItems(n)
                        }}>
                          <option value="">Seleccionar...</option>
                          {recetas.map(r => <option key={r.id} value={r.id}>{r.nombre} ({r.sku}) — {fmt(r.precio_venta)}</option>)}
                        </select>
                      </div>
                      <div style={{ width: 80 }}>
                        <label className="fl">Cantidad</label>
                        <input type="number" min="1" value={item.cantidad || 1} onChange={e => {
                          const n = [...lItems]; n[i] = { ...n[i], cantidad: e.target.value }; setLItems(n)
                        }} />
                      </div>
                      {receta && (
                        <div style={{ paddingTop: 18, fontSize: 11, color: 'var(--text2)' }}>
                          {fmt(receta.precio_venta * (item.cantidad || 1))}
                        </div>
                      )}
                      <button className="btn btn-sm btn-danger" onClick={() => setLItems(lItems.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Resumen precio */}
          {precioIndividual > 0 && (
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>Precio individual (suma)</span>
                <span style={{ fontWeight: 500 }}>{fmt(precioIndividual)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text2)', fontSize: 13 }}>Precio combo</span>
                <span style={{ fontWeight: 600, color: 'var(--accent2)', fontSize: 16 }}>{fmt(precio)}</span>
              </div>
              {ahorro > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--green2)', fontSize: 13 }}>Ahorro del cliente</span>
                  <span style={{ fontWeight: 600, color: 'var(--green2)' }}>{fmt(ahorro)} ({Math.round((ahorro / precioIndividual) * 100)}%)</span>
                </div>
              )}
            </div>
          )}

          <div className="fg">
            <label className="fl">Precio del combo ($) *</label>
            <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0" />
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando...' : isNew ? 'Crear combo' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Combos() {
  const [combos, setCombos] = useState([])
  const [recetas, setRecetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const [c, r] = await Promise.all([
      sb.from('combos').select('*,combo_items(*, recetas(nombre,sku,precio_venta))').eq('activo', true).order('nombre'),
      sb.from('recetas').select('*').eq('activa', true).order('nombre')
    ])
    setCombos(c.data || [])
    setRecetas(r.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openEdit = async id => {
    const { data: c } = await sb.from('combos').select('*').eq('id', id).single()
    const { data: items } = await sb.from('combo_items').select('*').eq('combo_id', id)
    setModal({ combo: c, items: items || [] })
  }

  if (loading) return <div className="loading">Cargando combos...</div>

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Combos</div><div className="page-sub">Precios especiales para múltiples platos</div></div>
        <button className="btn btn-primary" onClick={() => setModal({ combo: null, items: [] })}>+ Nuevo combo</button>
      </div>

      {combos.length === 0
        ? <div className="empty"><div className="empty-icon">📦</div><div>No hay combos creados aún</div></div>
        : <div className="g2">
          {combos.map(c => {
            const precioInd = (c.combo_items || []).reduce((s, i) => s + ((i.recetas?.precio_venta || 0) * i.cantidad), 0)
            const ahorro = precioInd - c.precio_combo
            return (
              <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openEdit(c.id)}>
                <div className="flex gap2" style={{ marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: 'var(--cream)' }}>{c.nombre}</div>
                    {c.descripcion && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{c.descripcion}</div>}
                  </div>
                  <span className="badge bg" style={{ alignSelf: 'flex-start' }}>📦 COMBO</span>
                </div>

                <div style={{ marginBottom: 10 }}>
                  {(c.combo_items || []).map((item, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      {item.cantidad}× {item.recetas?.nombre} <span style={{ color: 'var(--text3)' }}>({item.recetas?.sku})</span>
                      <span style={{ float: 'right' }}>{fmt((item.recetas?.precio_venta || 0) * item.cantidad)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Precio individual</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)', textDecoration: 'line-through' }}>{fmt(precioInd)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 500 }}>Precio combo</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>{fmt(c.precio_combo)}</span>
                  </div>
                  {ahorro > 0 && (
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--green2)', marginTop: 4 }}>
                      Ahorro: {fmt(ahorro)} ({Math.round((ahorro / precioInd) * 100)}%)
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', marginTop: 8 }}>click para editar</div>
              </div>
            )
          })}
        </div>}

      {modal && (
        <ComboModal
          combo={modal.combo}
          items={modal.items}
          recetas={recetas}
          onSave={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
