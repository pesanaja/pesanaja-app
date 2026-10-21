import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from './lib/supabase'

export default function Auth({ onSignedIn }: { onSignedIn: (userId: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    if (!supabase) { setError('Koneksi Supabase belum tersedia. Periksa .env.local lalu restart aplikasi.'); return }
    if (mode === 'signup' && password !== confirmPassword) { setError('Konfirmasi kata sandi belum sama.'); return }
    setBusy(true)
    try {
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` })
        if (resetError) throw resetError
        setMessage('Tautan reset kata sandi sudah dikirim ke email kamu.')
        return
      }
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name, phone, role } } })
        if (signUpError) throw signUpError
        if (data.session && data.user) onSignedIn(data.user.id)
        else setMessage('Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk ke PesanAja.')
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })
        if (loginError) throw loginError
        if (data.user) onSignedIn(data.user.id)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Terjadi kendala. Coba lagi.') }
    finally { setBusy(false) }
  }

  const title = mode === 'signup' ? 'Daftar' : mode === 'reset' ? 'Atur Kata Sandi' : 'Masuk'
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}>
    <header><h1>{title}</h1>{mode !== 'reset' && <p>{mode === 'signup' ? 'Telah memiliki akun?' : 'Belum memiliki akun?'} <button type="button" className="auth-inline" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Masuk' : 'Daftar'}</button></p>}</header>
    {mode === 'signup' && <div className="auth-role"><button type="button" className={role === 'buyer' ? 'chosen' : ''} onClick={() => setRole('buyer')}>Pembeli</button><button type="button" className={role === 'seller' ? 'chosen' : ''} onClick={() => setRole('seller')}>Penjual</button></div>}
    {mode === 'signup' && <input autoComplete="name" placeholder="Nama Lengkap" value={name} onChange={e => setName(e.target.value)} required />}
    {mode === 'signup' && <input autoComplete="tel" type="tel" placeholder="Nomor Telepon" value={phone} onChange={e => setPhone(e.target.value)} required />}
    <input autoComplete="email" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
    {mode !== 'reset' && <div className="auth-password-field"><input autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} placeholder="Kata Sandi" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>}
    {mode === 'signup' && <div className="auth-password-field"><input autoComplete="new-password" type={showConfirmPassword ? 'text' : 'password'} placeholder="Konfirmasi Kata Sandi" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required /><button type="button" className="auth-password-toggle" aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>}
    {mode === 'login' && <button className="auth-forgot" type="button" onClick={() => setMode('reset')}>Lupa Kata Sandi?</button>}
    {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}
    <button className="auth-submit" disabled={busy}>{busy ? 'Memproses…' : mode === 'signup' ? 'Daftar' : mode === 'reset' ? 'Kirim Tautan' : 'Masuk'}</button>
  </form></main>
}
