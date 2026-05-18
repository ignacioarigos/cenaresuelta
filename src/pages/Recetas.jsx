import { useState, useEffect, useRef } from 'react'
import { sb, fmt } from '../lib/supabase'
import { useToast } from '../components/Toast'

function RecetaModal({ receta, mats, mobs, otros, onSave, onClose }) {
  const toast = useToast()
  const isNew = !receta
  const UNIDADES = ['kg', 'g', 'L', 'ml', 'Unidad', 'Pack', 'Docena']

  const [nombre, setNombre] = useState(receta?.nombre || '')
  const [sku, setSku] = useState(receta?.sku || '')
  const [porciones, setPorciones] = useState(receta?.porciones || 1)
  const [modo, setModo] = useState('lote')
  const [precio, setPrecio] = useState(receta?.precio_venta || 0)
  const [margen, setMargen] = useState(() => {
    if (receta?.precio_venta && receta?.costo_total)
      return Math.round(((receta.precio_venta - receta.costo_total) / receta.precio_venta) * 100)
    return 30
  })
  const [impuestos, setImpuestos] = useState(Math.round((receta?.impuestos_pct || 0) * 100))
  const [notas, setNotas] = useState(receta?.notas || '')
  const [lMats, setLMats] = useState(mats.map(m => ({ ...m })))
  const [lMobs, setLMobs] = useState(mobs.map(m => ({ ...m })))
  const [lOtros, setLOtros] = useState(otros.map(m => ({ ...m })))
  const [saving, setSaving] = useState(false)
  const precioManual = useRef(false)

  const divisor = modo === 'lote' ? (parseInt(porciones) || 1) : 1

  const costMatLote = lMats.reduce((s, m) => s + ((parseFloat(m.precio_unidad) || 0) * (parseFloat(m.cantidad) || 0)), 0)
  const costMobLote = lMobs.reduce((s, m) => s + ((parseFloat(m.tarifa_hora) || 0) * ((parseFloat(m.minutos) || 0) / 60)), 0)
  const costMatU = costMatLote / divisor
  const costMobU = costMobLote / divisor
  const costOtrosU = lOtros.reduce((s, o) => s + ((parseFloat(o.costo) || 0) * (parseFloat(o.cantidad) || 0)), 0)
  const totalU = costMatU + costMobU + costOtrosU
  const ganancia = precio - totalU
  const margenReal = precio > 0 ? Math.round(((precio - totalU) / precio) * 100) : 0

  const onMargenChange = val => {
    setMargen(val)
    const m = parseFloat(val) || 0
    if (totalU > 0 && m < 100) { setPrecio(Math.round(totalU / (1 - m / 100))); precioManual.current = false }
  }
  const onPrecioChange = val => {
    setPrecio(val)
    const p = parseFloat(val) || 0
    if (p > 0) setMargen(Math.round(((p - totalU) / p) * 100))
    precioManual.current = true
  }

  // Update precio when ingredients change (if not manually set)
  useEffect(() => {
    if (!precioManual.current && parseFloat(margen) > 0 && totalU > 0) {
      setPrecio(Math.round(totalU / (1 - parseFloat(margen) / 100)))
    }
  }, [totalU])

  const save = async () => {
    if (!nombre || !sku) { toast('Nombre y SKU son obligatorios', 'err'); return }
    setSaving(true)
    const hayDetalle = lMats.filter(m => m.nombre).length > 0 || lMobs.filter(m => m.actividad).length > 0 || lOtros.filter(o => o.item).length > 0
    let costMat, costMob, costOtros
    if (hayDetalle) {
      costMat = costMatLote / divisor
      costMob = costMobLote / divisor
      costOtros = costOtrosU
    } else {
      costMat = receta?.costo_materiales || 0
      costMob = receta?.costo_mano_obra || 0
      costOtros = receta?.otros_costos || 0
    }
    const costTotal = costMat + costMob + costOtros
    const p = parseFloat(precio) || 0
    const payload = {
      nombre, sku: sku.toUpperCase(), porciones: parseInt(porciones) || 1,
      costo_materiales: costMat, costo_mano_obra: costMob, otros_costos: costOtros,
      precio_venta: p, margen_pct: p > 0 ? (p - costTotal) / p : 0,
      impuestos_pct: parseFloat(impuestos || 0) / 100, descuentos_pct: 0,
      notas, activa: true
    }
    let recetaId = receta?.id
    if (isNew) {
      const { data, error } = await sb.from('recetas').insert(payload).select().single()
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      recetaId = data.id
    } else {
      const { error } = await sb.from('recetas').update(payload).eq('id', recetaId)
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      if (hayDetalle) {
        await Promise.all([
          sb.from('receta_materiales').delete().eq('receta_id', recetaId),
          sb.from('receta_mano_obra').delete().eq('receta_id', recetaId),
          sb.from('receta_otros').delete().eq('receta_id', recetaId),
        ])
      }
    }
    if (hayDetalle) {
      if (lMats.filter(m => m.nombre).length) await sb.from('receta_materiales').insert(lMats.filter(m => m.nombre).map((m, i) => ({ receta_id: recetaId, nombre: m.nombre, unidad: m.unidad || 'kg', precio_unidad: parseFloat(m.precio_unidad) || 0, cantidad: parseFloat(m.cantidad) || 0, orden: i })))
      if (lMobs.filter(m => m.actividad).length) await sb.from('receta_mano_obra').insert(lMobs.filter(m => m.actividad).map((m, i) => ({ receta_id: recetaId, actividad: m.actividad, tarifa_hora: parseFloat(m.tarifa_hora) || 0, minutos: parseFloat(m.minutos) || 0, orden: i })))
      if (lOtros.filter(o => o.item).length) await sb.from('receta_otros').insert(lOtros.filter(o => o.item).map((o, i) => ({ receta_id: recetaId, item: o.item, costo: parseFloat(o.costo) || 0, cantidad: parseFloat(o.cantidad) || 1, orden: i })))
    }
    toast(isNew ? 'Receta creada' : 'Receta guardada')
    onSave()
  }

  const deleteReceta = async () => {
    if (!confirm('¿Eliminar esta receta?')) return
    await sb.from('recetas').update({ activa: false }).eq('id', receta.id)
    toast('Receta eliminada')
    onSave()
  }

  const barW = Math.min(Math.max(margenReal, 0), 100)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-hdr">
          <div className="modal-title">{isNew ? 'Nueva receta' : receta.nombre}</div>
          <div className="flex gap2">
            {!isNew && <button className="btn btn-sm btn-danger" onClick={deleteReceta}>Eliminar</button>}
            <button className="btn btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          {/* Config */}
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 14, marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Configuración</div>
            <div className="g3">
              <div className="fg"><label className="fl">Nombre *</label><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de la receta" /></div>
              <div className="fg"><label className="fl">SKU *</label><input value={sku} onChange={e => setSku(e.target.value)} placeholder="PCP1" /></div>
              <div className="fg"><label className="fl">Porciones que rinde</label><input type="number" min="1" value={porciones} onChange={e => setPorciones(e.target.value)} /></div>
            </div>
          </div>

          {/* Modo */}
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r)', padding: 14, marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Modo de carga</div>
            <div className="flex gap2" style={{ marginBottom: 8 }}>
              <button className={`btn${modo === 'lote' ? ' btn-primary' : ''}`} onClick={() => setModo('lote')} style={{ flex: 1 }}>📦 Por lote</button>
              <button className={`btn${modo === 'porcion' ? ' btn-primary' : ''}`} onClick={() => setModo('porcion')} style={{ flex: 1 }}>🍽 Por porción</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {modo === 'lote' ? 'Cantidades para el lote completo — se divide por porciones automáticamente' : 'Cantidades por porción individual'}
            </div>
          </div>

          {/* Resumen live */}
          <div style={{ background: 'rgba(200,135,58,.08)', border: '1px solid rgba(200,135,58,.2)', borderRadius: 'var(--r)', padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 8, marginBottom: 12 }}>
              {[['Mat/p', fmt(costMatU)], ['MO/p', fmt(costMobU)], ['Otros/p', fmt(costOtrosU)], ['Costo/p', fmt(totalU)], ['Precio', fmt(precio)], ['Ganancia', fmt(ganancia)], ['Margen', margenReal + '%']].map(([lbl, val]) => (
                <div key={lbl} style={{ textAlign: 'center', background: 'var(--surface)', borderRadius: 6, padding: '8px 4px' }}>
                  <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</div>
                  <div style={{ fontWeight: 600, color: 'var(--cream)', fontSize: 12 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: barW + '%', background: margenReal >= 0 ? 'var(--green2)' : 'var(--red2)', borderRadius: 2, transition: 'width .3s' }} />
            </div>
            <div className="g2" style={{ marginTop: 12 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Margen deseado (%)</label>
                <input type="number" value={margen} onChange={e => onMargenChange(e.target.value)} style={{ background: 'var(--surface)' }} />
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>Modificá el margen → precio se calcula solo</div>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Precio de venta ($)</label>
                <input type="number" value={precio} onChange={e => onPrecioChange(e.target.value)} style={{ background: 'var(--surface)' }} />
                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>O fijá el precio → margen se recalcula</div>
              </div>
            </div>
            <div className="fg" style={{ marginTop: 10, marginBottom: 0 }}>
              <label className="fl">Impuestos (%)</label>
              <input type="number" value={impuestos} onChange={e => setImpuestos(e.target.value)} style={{ background: 'var(--surface)' }} />
            </div>
          </div>

          {/* Materiales */}
          <div style={{ marginBottom: 14 }}>
            <div className="flex gap2" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Costos de Materiales</div>
              <button className="btn btn-sm mla" onClick={() => setLMats([...lMats, { nombre: '', unidad: 'kg', precio_unidad: 0, cantidad: 0 }])}>+ Ingrediente</button>
            </div>
            {lMats.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>Sin ingredientes — hacé click en + Ingrediente</div>
              : lMats.map((m, i) => {
                const sub = (parseFloat(m.precio_unidad) || 0) * (parseFloat(m.cantidad) || 0)
                const subU = sub / divisor
                return (
                  <div key={i} className="item-card" style={{ marginBottom: 8 }}>
                    <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: 2, minWidth: 110 }}><label className="fl">Ingrediente</label>
                        <input value={m.nombre || ''} onChange={e => { const n = [...lMats]; n[i] = { ...n[i], nombre: e.target.value }; setLMats(n) }} />
                      </div>
                      <div style={{ width: 65 }}><label className="fl">Unidad</label>
                        <select value={m.unidad || 'kg'} onChange={e => { const n = [...lMats]; n[i] = { ...n[i], unidad: e.target.value }; setLMats(n) }}>
                          {UNIDADES.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <div style={{ width: 100 }}><label className="fl">Precio/u ($)</label>
                        <input type="number" value={m.precio_unidad || 0} onChange={e => { const n = [...lMats]; n[i] = { ...n[i], precio_unidad: e.target.value }; setLMats(n) }} />
                      </div>
                      <div style={{ width: 80 }}><label className="fl">Cantidad</label>
                        <input type="number" step="0.001" value={m.cantidad || 0} onChange={e => { const n = [...lMats]; n[i] = { ...n[i], cantidad: e.target.value }; setLMats(n) }} />
                      </div>
                      <div style={{ minWidth: 80, paddingTop: 18, fontSize: 11, textAlign: 'right' }}>
                        {modo === 'lote' && divisor > 1
                          ? <><div style={{ color: 'var(--text3)' }}>{fmt(sub)} lote</div><div style={{ color: 'var(--cream)', fontWeight: 500 }}>{fmt(subU)}/u</div></>
                          : <div style={{ color: 'var(--cream)', fontWeight: 500 }}>{fmt(sub)}</div>}
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => setLMats(lMats.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Mano de obra */}
          <div style={{ marginBottom: 14 }}>
            <div className="flex gap2" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Mano de Obra</div>
              <button className="btn btn-sm mla" onClick={() => setLMobs([...lMobs, { actividad: '', tarifa_hora: 2000, minutos: 0 }])}>+ Actividad</button>
            </div>
            {lMobs.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>Sin actividades — hacé click en + Actividad</div>
              : lMobs.map((m, i) => {
                const costo = (parseFloat(m.tarifa_hora) || 0) * ((parseFloat(m.minutos) || 0) / 60)
                const costoU = costo / divisor
                return (
                  <div key={i} className="item-card" style={{ marginBottom: 8 }}>
                    <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: 2, minWidth: 110 }}><label className="fl">Actividad</label>
                        <input value={m.actividad || ''} onChange={e => { const n = [...lMobs]; n[i] = { ...n[i], actividad: e.target.value }; setLMobs(n) }} />
                      </div>
                      <div style={{ width: 110 }}><label className="fl">Tarifa/hora ($)</label>
                        <input type="number" value={m.tarifa_hora || 0} onChange={e => { const n = [...lMobs]; n[i] = { ...n[i], tarifa_hora: e.target.value }; setLMobs(n) }} />
                      </div>
                      <div style={{ width: 80 }}><label className="fl">Minutos</label>
                        <input type="number" value={m.minutos || 0} onChange={e => { const n = [...lMobs]; n[i] = { ...n[i], minutos: e.target.value }; setLMobs(n) }} />
                      </div>
                      <div style={{ minWidth: 80, paddingTop: 18, fontSize: 11, textAlign: 'right' }}>
                        {modo === 'lote' && divisor > 1
                          ? <><div style={{ color: 'var(--text3)' }}>{fmt(costo)} lote</div><div style={{ color: 'var(--cream)', fontWeight: 500 }}>{fmt(costoU)}/u</div></>
                          : <div style={{ color: 'var(--cream)', fontWeight: 500 }}>{fmt(costo)}</div>}
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => setLMobs(lMobs.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Otros */}
          <div style={{ marginBottom: 14 }}>
            <div className="flex gap2" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Otros Costos <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, textTransform: 'none' }}>· siempre por porción</span></div>
              <button className="btn btn-sm mla" onClick={() => setLOtros([...lOtros, { item: '', costo: 0, cantidad: 1 }])}>+ Item</button>
            </div>
            {lOtros.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>Sin items — hacé click en + Item</div>
              : lOtros.map((o, i) => (
                <div key={i} className="item-card" style={{ marginBottom: 8 }}>
                  <div className="flex gap2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 2, minWidth: 130 }}><label className="fl">Item</label>
                      <input value={o.item || ''} onChange={e => { const n = [...lOtros]; n[i] = { ...n[i], item: e.target.value }; setLOtros(n) }} />
                    </div>
                    <div style={{ width: 110 }}><label className="fl">Costo ($)</label>
                      <input type="number" value={o.costo || 0} onChange={e => { const n = [...lOtros]; n[i] = { ...n[i], costo: e.target.value }; setLOtros(n) }} />
                    </div>
                    <div style={{ width: 70 }}><label className="fl">Cant.</label>
                      <input type="number" value={o.cantidad || 1} onChange={e => { const n = [...lOtros]; n[i] = { ...n[i], cantidad: e.target.value }; setLOtros(n) }} />
                    </div>
                    <div style={{ minWidth: 70, paddingTop: 18, fontSize: 11, color: 'var(--cream)', fontWeight: 500, textAlign: 'right' }}>{fmt((parseFloat(o.costo) || 0) * (parseFloat(o.cantidad) || 1))}</div>
                    <button className="btn btn-sm btn-danger" onClick={() => setLOtros(lOtros.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                </div>
              ))}
          </div>

          <div className="fg"><label className="fl">Notas</label>
            <textarea rows="2" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas sobre la receta" />
          </div>

          <div className="modal-footer">
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar receta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Recetas() {
  const [recetas, setRecetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await sb.from('recetas').select('*').eq('activa', true).order('nombre')
    setRecetas(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openEdit = async id => {
    const [rr, mats, mobs, otros] = await Promise.all([
      sb.from('recetas').select('*').eq('id', id).single(),
      sb.from('receta_materiales').select('*').eq('receta_id', id).order('orden'),
      sb.from('receta_mano_obra').select('*').eq('receta_id', id).order('orden'),
      sb.from('receta_otros').select('*').eq('receta_id', id).order('orden'),
    ])
    setModal({ receta: rr.data, mats: mats.data || [], mobs: mobs.data || [], otros: otros.data || [] })
  }

  if (loading) return <div className="loading">Cargando recetas...</div>

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Recetas</div><div className="page-sub">Costos y márgenes del menú</div></div>
        <button className="btn btn-primary" onClick={() => setModal({ receta: null, mats: [], mobs: [], otros: [] })}>+ Nueva receta</button>
      </div>

      {recetas.length === 0
        ? <div className="empty"><div className="empty-icon">🍽</div><div>No hay recetas</div></div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {recetas.map(r => {
            const margen = r.precio_venta > 0 ? Math.round((r.ganancia_neta / r.precio_venta) * 100) : 0
            const barW = Math.min(Math.max(margen, 0), 100)
            return (
              <div key={r.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }} onClick={() => openEdit(r.id)}>
                <div className="flex gap2">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: 'var(--cream)' }}>{r.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>SKU: {r.sku} · {r.porciones} porción{r.porciones > 1 ? 'es' : ''}</div>
                  </div>
                  <span className="badge bg" style={{ alignSelf: 'flex-start' }}>+{fmt(r.ganancia_neta)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                  {[['Materiales', r.costo_materiales, 'var(--text2)'], ['Mano obra', r.costo_mano_obra, 'var(--text2)'], ['Otros', r.otros_costos, 'var(--text2)'], ['Costo total', r.costo_total, 'var(--cream)']].map(([lbl, val, c]) => (
                    <div key={lbl} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 6px', minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl}</div>
                      <div style={{ fontWeight: 500, color: c, fontSize: 12, wordBreak: 'break-all' }}>{fmt(val)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>Precio de venta</div>
                    <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--accent2)' }}>{fmt(r.precio_venta)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Margen</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--green2)' }}>{margen}%</div>
                  </div>
                </div>
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: -4 }}>
                  <div style={{ height: '100%', width: barW + '%', background: 'var(--green2)', borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', marginTop: -4 }}>click para editar</div>
              </div>
            )
          })}
        </div>}

      {modal && (
        <RecetaModal
          receta={modal.receta}
          mats={modal.mats}
          mobs={modal.mobs}
          otros={modal.otros}
          onSave={() => { setModal(null); load() }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
