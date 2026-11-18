import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from './lib/supabase'
import { isValidPersonName, normalizePersonName } from './lib/nameValidation'

function getPasswordError(password: string) {
  if (password.length < 8) return 'Kata sandi minimal 8 karakter.'
  if (/^(.)\1+$/.test(password)) return 'Kata sandi tidak boleh hanya mengulang karakter yang sama.'
  if (/12345678|87654321|abcdefgh|qwertyui|password/i.test(password)) return 'Kata sandi terlalu mudah ditebak. Gunakan kombinasi yang berbeda.'

  const characterTypes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
  if (characterTypes.filter(pattern => pattern.test(password)).length < 3) {
    return 'Gunakan minimal 3 jenis karakter: huruf kecil, huruf besar, angka, atau simbol.'
  }

  return ''
}

const registeredEmailMessage = 'Email sudah terdaftar. Silakan masuk atau gunakan fitur lupa kata sandi.'

type AuthMode = 'login' | 'signup' | 'reset' | 'update-password'

function getAuthErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : ''
  if (/invalid login credentials|invalid credentials/i.test(message)) return 'Email atau kata sandi salah.'
  if (/email not confirmed/i.test(message)) return 'Email belum dikonfirmasi. Periksa kotak masuk email kamu.'
  if (/password.*(weak|short|at least)|weak password/i.test(message)) return 'Kata sandi belum memenuhi persyaratan keamanan.'
  return message || 'Terjadi kendala. Coba lagi.'
}

export default function Auth({
  onSignedIn,
  initialMode = 'login',
  onRecoveryComplete,
}: {
  onSignedIn: (userId: string) => void
  initialMode?: AuthMode
  onRecoveryComplete?: () => void
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [buyerName, setBuyerName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [phone, setPhone] = useState('')
  const [nim, setNim] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [recoveryUpdated, setRecoveryUpdated] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('')
    if (!supabase) { setError('Koneksi Supabase belum tersedia. Periksa .env.local lalu restart aplikasi.'); return }
    const normalizedEmail = email.trim().toLowerCase()
    if (mode === 'signup' && role === 'seller' && email.trim().toLowerCase().split('@').pop() !== 'student.ub.ac.id') {
      setError('Pendaftaran penjual hanya menggunakan email @student.ub.ac.id.')
      return
    }
    if ((mode === 'signup' || mode === 'update-password') && password !== confirmPassword) {
      setError('Konfirmasi kata sandi belum sama.')
      return
    }
    if (mode === 'signup' && role === 'buyer' && !isValidPersonName(buyerName)) {
      setError('Nama pembeli harus berisi huruf dan hanya boleh memakai spasi, tanda hubung, atau apostrof.')
      return
    }
    if (mode === 'signup' && role === 'seller' && !isValidPersonName(ownerName)) {
      setError('Nama pemilik harus berisi huruf dan hanya boleh memakai spasi, tanda hubung, atau apostrof.')
      return
    }
    if (mode === 'signup' && role === 'seller' && !storeName.trim()) {
      setError('Nama toko wajib diisi.')
      return
    }
    if (mode === 'signup' || mode === 'update-password') {
      const passwordError = getPasswordError(password)
      if (passwordError) { setError(passwordError); return }
    }
    if (mode === 'signup') {
      if (!/^\d+$/.test(phone)) { setError('Nomor telepon hanya boleh berisi angka.'); return }
      if (role === 'seller' && !nim.trim()) { setError('NIM wajib diisi untuk akun penjual.'); return }
      if (role === 'seller' && !/^\d+$/.test(nim)) { setError('NIM hanya boleh berisi angka.'); return }
    }
    setBusy(true)
    try {
      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${location.origin}/` })
        if (resetError) throw resetError
        setMessage('Tautan reset kata sandi sudah dikirim ke email kamu.')
        return
      }
      if (mode === 'update-password') {
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        setRecoveryUpdated(true)
        setPassword('')
        setConfirmPassword('')
        setMessage('Kata sandi berhasil diperbarui. Kembali ke halaman masuk untuk melanjutkan.')
        return
      }
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: location.origin,
            data: {
              full_name: normalizePersonName(role === 'buyer' ? buyerName : ownerName),
              phone: phone.trim(),
              role,
              ...(role === 'seller' ? { nim: nim.trim(), store_name: storeName.trim() } : {}),
            },
          },
        })
        if (signUpError) {
          if (/already registered|already exists/i.test(signUpError.message)) {
            setError(registeredEmailMessage)
            return
          }
          throw signUpError
        }
        if (data.user?.identities?.length === 0) {
          setError(registeredEmailMessage)
          return
        }
        if (data.session && data.user) onSignedIn(data.user.id)
        else setMessage('Pendaftaran berhasil. Cek email untuk konfirmasi, lalu masuk ke PesanAja.')
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (loginError) throw loginError
        if (data.user) onSignedIn(data.user.id)
      }
    } catch (cause) { setError(getAuthErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  async function leaveRecovery() {
    setError('')
    setBusy(true)
    try {
      if (supabase) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) throw signOutError
      }
      onRecoveryComplete?.()
    } catch (cause) { setError(getAuthErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  const title = mode === 'signup' ? 'Daftar' : mode === 'reset' ? 'Lupa Kata Sandi' : mode === 'update-password' ? 'Buat Kata Sandi Baru' : 'Masuk'
  return <main className="auth-page"><form className={`auth-card auth-card-${mode}`} onSubmit={submit}>
    <header>
      <h1>{title}</h1>
      {mode === 'login' && <p>Belum memiliki akun? <button type="button" className="auth-inline" onClick={() => { setError(''); setMessage(''); setMode('signup') }}>Daftar</button></p>}
      {mode === 'signup' && <p>Telah memiliki akun? <button type="button" className="auth-inline" onClick={() => { setError(''); setMessage(''); setMode('login') }}>Masuk</button></p>}
      {mode === 'reset' && <p>Masukkan email untuk menerima tautan pengaturan ulang.</p>}
      {mode === 'update-password' && !recoveryUpdated && <p>Gunakan kata sandi baru untuk akun PesanAja kamu.</p>}
    </header>
    {mode === 'signup' && <div className="auth-role"><button type="button" className={role === 'buyer' ? 'chosen' : ''} onClick={() => setRole('buyer')}>Pembeli</button><button type="button" className={role === 'seller' ? 'chosen' : ''} onClick={() => setRole('seller')}>Penjual</button></div>}
    {mode === 'signup' && role === 'buyer' && <input autoComplete="name" placeholder="Nama Lengkap" value={buyerName} onChange={e => setBuyerName(e.target.value)} required />}
    {mode !== 'update-password' && <input autoComplete="email" type="email" placeholder={mode === 'signup' && role === 'seller' ? 'Email UB (@student.ub.ac.id)' : 'Email'} aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required />}
    {mode === 'signup' && role === 'seller' && <input autoComplete="name" placeholder="Nama Penanggung Jawab / Pemilik Usaha" value={ownerName} onChange={e => setOwnerName(e.target.value)} required />}
    {mode === 'signup' && <input autoComplete="tel" type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="Nomor Telepon" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} required />}
    {mode === 'signup' && role === 'seller' && <>
      <input autoComplete="off" inputMode="numeric" pattern="[0-9]*" placeholder="NIM Anda/perwakilan" value={nim} onChange={e => setNim(e.target.value.replace(/\D/g, ''))} required />
      <input autoComplete="organization" placeholder="Nama Toko" value={storeName} onChange={e => setStoreName(e.target.value)} required />
    </>}
    {mode !== 'reset' && !recoveryUpdated && <div className="auth-password-field"><input autoComplete={mode === 'signup' || mode === 'update-password' ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} placeholder={mode === 'update-password' ? 'Kata Sandi Baru' : 'Kata Sandi'} value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'signup' || mode === 'update-password' ? 8 : undefined} required /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>}
    {(mode === 'signup' || mode === 'update-password') && !recoveryUpdated && <><small className="auth-password-hint">Minimal 8 karakter. Gunakan sedikitnya 3 jenis karakter dan hindari pola yang mudah ditebak.</small><div className="auth-password-field"><input autoComplete="new-password" type={showConfirmPassword ? 'text' : 'password'} placeholder="Konfirmasi Kata Sandi Baru" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required /><button type="button" className="auth-password-toggle" aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></>}
    {mode === 'login' && <button className="auth-forgot" type="button" onClick={() => setMode('reset')}>Lupa Kata Sandi?</button>}
    {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}
    {!recoveryUpdated && <button className="auth-submit" disabled={busy}>{busy ? 'Memproses…' : mode === 'signup' ? 'Daftar' : mode === 'reset' ? 'Kirim Tautan' : mode === 'update-password' ? 'Simpan Kata Sandi Baru' : 'Masuk'}</button>}
    {mode === 'reset' && <button type="button" className="auth-back" onClick={() => { setError(''); setMessage(''); setMode('login') }}>Kembali ke masuk</button>}
    {mode === 'update-password' && <button type="button" className="auth-back" onClick={() => void leaveRecovery()} disabled={busy}>Kembali ke halaman masuk</button>}
  </form></main>
}
