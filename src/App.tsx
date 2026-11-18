import { useEffect, useRef, useState } from 'react'
import Auth from './Auth'
import BuyerStore from './BuyerStore'
import Onboarding from './Onboarding'
import SellerWorkspace from './SellerWorkspace'
import { isPasswordRecoveryRedirect, supabase } from './lib/supabase'

function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'buyer' | 'seller'>('buyer')
  const [authReady, setAuthReady] = useState(!supabase)
  const [passwordRecovery, setPasswordRecovery] = useState(isPasswordRecoveryRedirect)
  const [onboarded, setOnboarded] = useState(false)
  const [sellerProfileLoading, setSellerProfileLoading] = useState(false)
  const [sellerProfileError, setSellerProfileError] = useState('')
  const [storeName, setStoreName] = useState('')
  const [registeredStoreName, setRegisteredStoreName] = useState('')
  const [registeredOwnerName, setRegisteredOwnerName] = useState('')
  const [registeredPhone, setRegisteredPhone] = useState('')
  const authUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'TOKEN_REFRESHED') return
      const isSeller = session?.user.user_metadata.role === 'seller'
      const userChanged = session?.user.id !== authUserId.current
      authUserId.current = session?.user.id ?? null
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (userChanged) {
          setSellerProfileLoading(Boolean(session && isSeller))
          setSellerProfileError('')
        }
      } else if (!session) {
        setSellerProfileLoading(false)
        setSellerProfileError('')
      }
      setUserId(session?.user.id ?? null)
      setUserRole(isSeller ? 'seller' : 'buyer')
      setRegisteredStoreName(isSeller ? session.user.user_metadata.store_name ?? '' : '')
      setRegisteredOwnerName(isSeller ? session.user.user_metadata.full_name ?? '' : '')
      setRegisteredPhone(isSeller ? session.user.user_metadata.phone ?? '' : '')
      setAuthReady(true)
      if (!session) {
        setOnboarded(false)
        setSellerProfileLoading(false)
        setSellerProfileError('')
        setStoreName('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (passwordRecovery || !userId || !supabase) {
      setSellerProfileLoading(false)
      return
    }
    let active = true
    setSellerProfileLoading(userRole === 'seller')
    setSellerProfileError('')
    void (async () => {
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession()
        if (authError) throw new Error(`Gagal memeriksa sesi pengguna: ${authError.message}`)
        const user = session?.user
        if (!user) throw new Error('Sesi pengguna tidak ditemukan. Silakan masuk kembali.')
        if (user.user_metadata.role !== 'seller') {
          if (active) setOnboarded(true)
          return
        }
        const { data: store, error: storeError } = await supabase.from('seller_profiles').select('store_name').eq('user_id', user.id).maybeSingle()
        if (storeError) throw new Error(`Gagal memuat profil toko: ${storeError.message}`)
        if (!active) return
        if (store?.store_name) { setStoreName(store.store_name); setOnboarded(true) }
        else setOnboarded(false)
      } catch (cause) {
        if (active) {
          const message = cause instanceof Error ? cause.message : 'Gagal memuat profil penjual.'
          console.error(message)
          setSellerProfileError(message)
        }
      } finally {
        if (active) setSellerProfileLoading(false)
      }
    })()
    return () => { active = false }
  }, [userId, userRole, passwordRecovery])

  if (!authReady) return <div className="auth-loading">Memeriksa sesi PesanAja…</div>
  if (passwordRecovery) return <Auth key="password-recovery" initialMode="update-password" onSignedIn={setUserId} onRecoveryComplete={() => {
    setPasswordRecovery(false)
    setUserId(null)
    window.history.replaceState(null, '', window.location.pathname)
  }}/>
  if (supabase && !userId) return <Auth onSignedIn={setUserId}/>
  if (userRole === 'buyer') return <BuyerStore userId={userId} onSignOut={async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }
    setUserId(null)
  }}/>
  if (sellerProfileLoading) return <div className="auth-loading">Memeriksa profil toko…</div>
  if (sellerProfileError) return <div className="auth-loading" role="alert">{sellerProfileError}</div>
  if (!onboarded) return <Onboarding initialStoreName={registeredStoreName} initialOwnerName={registeredOwnerName} initialPhone={registeredPhone} onComplete={name => { setStoreName(name); setRegisteredStoreName(name); setOnboarded(true) }}/>
  if (!userId) return <div className="auth-loading">Sesi penjual tidak tersedia.</div>
  return <SellerWorkspace userId={userId} storeName={storeName} onStoreNameChange={setStoreName} onSignOut={() => { void supabase?.auth.signOut().then(({ error }) => {
    if (error) { console.error('Gagal keluar:', error.message); return }
    setUserId(null)
  }) }}/>
}

export default App
