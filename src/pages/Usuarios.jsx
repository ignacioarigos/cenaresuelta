import { useState, useEffect } from 'react'
import { sb, initials } from '../lib/supabase'
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

function UsuarioForm({ prefill, onSave, onClose, isEdit, userId }) {
  const { user: currentUser, setProfile, profile: currentProfile } = useAuth()
  const toast = useToast()
  const [nombre, setNombre] = useState(prefill?.nombre || '')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [rol, setRol] = useState(prefill?.rol || 'operador')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    if (isEdit) {
      const { error } = await sb.from('profiles').update({ nombre, rol }).eq('id', userId)
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      if (pass && pass.length >= 6 && userId === currentUser.id) {
        await sb.auth.updateUser({ password: pass })
        toast('Contraseña actualizada')
      } else if (pass && userId !== currentUser.id) {
        toast('Solo podés cambiar tu propia contraseña', 'err'); setSaving(false); return
      }
      if (userId === currentUser.id) setProfile(p => ({ ...p, nombre, rol }))
      toast('Usuario actualizado')
    } else {
      if (!nombre || !email || !pass) { toast('Completá todos los campos', 'err'); setSaving(false); return }
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre } } })
      if (error) { toast('Error: ' + error.message, 'err'); setSaving(false); return }
      if (data.user) await sb.from('profiles').upsert({ id: data.user.id, nombre, rol })
      toast('Usuario creado. Debe confirmar el email.')
    }
    onSave()
  }

  return (
    <>
      <div className="fg"><label className="fl">Nombre *</label><input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" /></div>
      {!isEdit && <div className="fg"><label className="fl">Email *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" /></div>}
      <div className="fg">
        <label className="fl">{isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Mínimo 6 caracteres" />
        {isEdit && userId !== currentUser.id && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Solo podés cambiar tu propia contraseña</div>}
      </div>
      <div className="fg"><label className="fl">Rol</label>
        <select value={rol} onChange={e => setRol(e.target.value)}>
          <option value="operador">Operador</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>
    </>
  )
}

export default function Usuarios() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await sb.from('profiles').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openEdit = async id => {
    const { data } = await sb.from('profiles').select('*').eq('id', id).single()
    setModal({ mode: 'edit', data, id })
  }

  if (loading) return <div className="loading">Cargando usuarios...</div>

  return (
    <div className="page">
      <div className="page-hdr">
        <div><div className="page-title">Usuarios</div><div className="page-sub">{users.length}/4 usuarios</div></div>
        {users.length < 4 && <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>+ Nuevo usuario</button>}
      </div>

      <div className="g2">
        {users.map(u => (
          <div key={u.id} className="card">
            <div className="flex gap3">
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 16, color: '#fff', flexShrink: 0 }}>
                {initials(u.nombre)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 15, color: 'var(--cream)' }}>{u.nombre}</div>
                <div style={{ marginTop: 4 }}><span className={`badge ${u.rol === 'admin' ? 'ba' : 'bgr'}`}>{u.rol}</span></div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Creado: {new Date(u.created_at).toLocaleDateString('es-AR')}</div>
              </div>
              <button className="btn btn-sm" onClick={() => openEdit(u.id)} style={{ alignSelf: 'flex-start' }}>✏</button>
            </div>
          </div>
        ))}
        {users.length < 4 && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px dashed var(--border2)', minHeight: 100 }} onClick={() => setModal({ mode: 'new' })}>
            <div style={{ textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
              <div style={{ fontSize: 13 }}>Agregar usuario</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{4 - users.length} lugar{4 - users.length !== 1 ? 'es' : ''} disponible{4 - users.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.mode === 'edit' ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setModal(null)}>
          <UsuarioForm
            prefill={modal.data}
            isEdit={modal.mode === 'edit'}
            userId={modal.id}
            onSave={() => { setModal(null); load() }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}
