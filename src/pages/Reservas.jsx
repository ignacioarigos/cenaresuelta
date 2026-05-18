import { useState, useEffect } from 'react'
import { sb, fmt, fmtD, today, estadoBadge, ESTADOS_R } from '../lib/supabase'
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

function ReservaForm({ prefill, onSave, onClose, isEdit, reservaId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    cliente: prefill?.cliente || '',
    descripcion: prefill?.descripcion || '',
    fecha_reserva: prefill?.fecha_reserva || today(),
    fecha_entrega: prefill?.fecha_entrega || '',
    estado: prefill?.estado || 'confirmada',
    notas: prefill?.notas || '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.cliente || !form.descripcion) { toast('Completá cliente y descripción', 'err'); return }
    setSaving(true)
    const payload = { ...form, fecha_entrega: form.fecha_entrega || null, updated_at: new Date().toISOString() }
    let error
    if (isEdit) {
      ({ error } = await sb.from('reservas').update(payload).eq('id', reservaId))
    } else {
      ({ error } = await sb.from('reservas').insert({ ...payload, creado_por: user.id }))
    }
    if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
    toast(isEdit ? 'Reserva actualizada' : 'Reserva guardada')
    onSave()
  }

  return (
    <>
      <div className="fg"><label className="fl">Cliente *</label>
        <input value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} placeholder="Nombre del cliente" />
      </div>
      <div className="fg"><label className="fl">Descripción *</label>
        <textarea rows="2" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: 3 porciones de Locro" />
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Fecha de reserva</label>
          <input type="date" value={form.fecha_reserva} onChange={e => setForm(f => ({ ...f, fecha_reserva: e.target.value }))} />
        </div>
        <div className="fg"><label className="fl">Fecha de entrega</label>
          <input type="date" value={form.fecha_entrega} onChange={e => setForm(f => ({ ...f, fecha_entrega: e.target.value }))} />
        </div>
      </div>
      <div className="fg"><label className="fl">Estado</label>
        <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
          {ESTADOS_R.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">Notas</label>
        <textarea rows="2" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Anotaciones adicionales" />
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar reserva'}
        </button>
      </div>
    </>
  )
}

export default function Reservas({ onNavigate }) {
  const toast = useToast()
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await sb.from('reservas').select('*,profiles(nombre)').order('fecha_entrega', { ascending: true, nullsFirst: false })
    setReservas(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateEstado = async (id, estado) => {
    await sb.from('reservas').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    toast('Estado actualizado')
    load()
  }

  const deleteReserva = async id => {
    if (!confirm('¿Eliminar esta reserva?')) return
    await sb.from('reservas').delete().eq('id', id)
    toast('Reserva eliminada')
    load()
  }

  const openEdit = async id => {
    const { data } = await sb.from('reservas').select('*').eq('id', id).single()
    setModal({ mode: 'edit', data, id })
  }

  const convertir = async r => {
    onNavigate && onNavigate('pedidos')
    // Pass reserva data via sessionStorage for Pedidos to pick up
    sessionStorage.setItem('convertirReserva', JSON.stringify({
      cliente: r.cliente, notas: r.descripcion + (r.notas ? '\n' + r.notas : ''),
      fecha_entrega: r.fecha_entrega, reserva_id: r.id
    }))
  }

  const activas = reservas.filter(r => r.estado !== 'cancelada').length
  const vencidas = reservas.filter(r => r.fecha_entrega && new Date(r.fecha_entrega + 'T12:00:00') < new Date() && r.estado !== 'cancelada').length

  if (loading) return <div className="loading">Cargando reservas...</div>

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Reservas</div><div className="page-sub">{activas} activas · {vencidas} vencidas</div></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>+ Nueva reserva</button>
      </div>

      {reservas.length === 0 ? (
        <div className="empty"><div className="empty-icon">📅</div><div>No hay reservas cargadas</div></div>
      ) : (
        <>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Cliente</th><th>Descripción</th><th>Reservado</th><th>Entrega</th><th>Estado</th><th>Por</th><th></th></tr></thead>
              <tbody>
                {reservas.map(r => {
                  const vencida = r.fecha_entrega && new Date(r.fecha_entrega + 'T12:00:00') < new Date() && r.estado !== 'cancelada'
                  return (
                    <tr key={r.id} style={vencida ? { background: 'rgba(163,61,61,.05)' } : {}}>
                      <td style={{ fontWeight: 500, color: 'var(--cream)' }}>{r.cliente}</td>
                      <td style={{ color: 'var(--text2)', fontSize: 13, maxWidth: 200 }}>{r.descripcion}</td>
                      <td>{fmtD(r.fecha_reserva)}</td>
                      <td style={vencida ? { color: 'var(--red2)', fontWeight: 500 } : {}}>{fmtD(r.fecha_entrega)}{vencida ? ' ⚠' : ''}</td>
                      <td>
                        <select value={r.estado} onChange={e => updateEstado(r.id, e.target.value)} style={{ width: 'auto', padding: '3px 8px', fontSize: 12 }}>
                          {ESTADOS_R.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{r.profiles?.nombre || '-'}</td>
                      <td><div className="flex gap2">
                        <button className="btn btn-sm" onClick={() => openEdit(r.id)}>✏</button>
                        <button className="btn btn-sm" onClick={() => convertir(r)} style={{ fontSize: 11 }}>→ Pedido</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteReserva(r.id)}>✕</button>
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-list">
            {reservas.map(r => {
              const vencida = r.fecha_entrega && new Date(r.fecha_entrega + 'T12:00:00') < new Date() && r.estado !== 'cancelada'
              return (
                <div key={r.id} className="m-card" style={vencida ? { borderColor: 'rgba(163,61,61,.3)' } : {}}>
                  <div className="m-card-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="m-card-title">{r.cliente}</div>
                      <div className="m-card-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descripcion}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: vencida ? 'var(--red2)' : 'var(--text3)' }}>{r.fecha_entrega ? fmtD(r.fecha_entrega) : 'Sin fecha'}</div>
                      <span className={`badge ${estadoBadge(r.estado)}`} style={{ marginTop: 4 }}>{r.estado}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={r.estado} onChange={e => updateEstado(r.id, e.target.value)} style={{ flex: 1, minWidth: 110, padding: '6px 10px', fontSize: 12 }}>
                      {ESTADOS_R.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <button className="btn btn-sm" onClick={() => openEdit(r.id)}>✏</button>
                    <button className="btn btn-sm" onClick={() => convertir(r)} style={{ fontSize: 11 }}>→ Pedido</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteReserva(r.id)}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {modal && (
        <Modal title={modal.mode === 'edit' ? 'Editar reserva' : 'Nueva reserva'} onClose={() => setModal(null)}>
          <ReservaForm
            prefill={modal.data}
            isEdit={modal.mode === 'edit'}
            reservaId={modal.id}
            onSave={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}
