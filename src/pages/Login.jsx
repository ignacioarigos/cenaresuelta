import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const handleLogin = async e => {
    e.preventDefault()
    setLoading(true)
    setErr('')
    const { error } = await sb.auth.signInWithPassword({ email, password: pass })
    if (error) { setErr(error.message); setLoading(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">Cena Resuelta</div>
        <div className="login-sub">CRM · Gestión del negocio</div>
        {err && <div className="err">{err}</div>}
        <form onSubmit={handleLogin}>
          <div className="fg">
            <label className="fl">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required />
          </div>
          <div className="fg">
            <label className="fl">Contraseña</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} required
              onKeyDown={e => e.key === 'Enter' && handleLogin(e)} />
          </div>
          <button className="btn btn-primary mt4" style={{ width: '100%' }} type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
