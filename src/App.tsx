import { useEffect, useState } from 'react'
import Auth from './Auth'
import BuyerStore from './BuyerStore'
import Onboarding from './Onboarding'
import SellerWorkspace from './SellerWorkspace'
import { supabase } from './lib/supabase'

function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'buyer' | 'seller'>('buyer')
  const [authReady, setAuthReady] = useState(!supabase)
  const [onboarded, setOnboarded] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [registeredStoreName, setRegisteredStoreName] = useState('')
  const [registeredOwnerName, setRegisteredOwnerName] = useState('')
  const [registeredPhone, setRegisteredPhone] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Gagal memeriksa sesi:', error.message)
      if (!active) return
      const user = data.session?.user
      const isSeller = user?.user_metadata.role === 'seller'
      setUserId(user?.id ?? null)
      setUserRole(isSeller ? 'seller' : 'buyer')
      setRegisteredStoreName(isSeller ? user.user_metadata.store_name ?? '' : '')
      setRegisteredOwnerName(isSeller ? user.user_metadata.full_name ?? '' : '')
      setRegisteredPhone(isSeller ? user.user_metadata.phone ?? '' : '')
      setAuthReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const isSeller = session?.user.user_metadata.role === 'seller'
      setUserId(session?.user.id ?? null)
      setUserRole(isSeller ? 'seller' : 'buyer')
      setRegisteredStoreName(isSeller ? session.user.user_metadata.store_name ?? '' : '')
      setRegisteredOwnerName(isSeller ? session.user.user_metadata.full_name ?? '' : '')
      setRegisteredPhone(isSeller ? session.user.user_metadata.phone ?? '' : '')
      if (!session) {
        setOnboarded(false)
        setStoreName('')
        localStorage.removeItem('pesanaja-seller-profile')
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!userId || !supabase) return
    let active = true
    void (async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) { console.error('Gagal memeriksa profil pengguna:', authError.message); return }
      if (!user) return
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: user.user_metadata.full_name ?? '',
        phone: user.user_metadata.phone ?? null,
      }, { onConflict: 'id' })
      if (profileError) console.error('Gagal menyimpan profil pengguna:', profileError.message)
      if (user.user_metadata.role !== 'seller') {
        if (active) setOnboarded(true)
        return
      }
      const { data: store, error: storeError } = await supabase.from('seller_profiles').select('store_name').eq('user_id', user.id).maybeSingle()
      if (storeError) { console.error('Gagal memuat profil toko:', storeError.message); return }
      if (!active) return
      if (store?.store_name) { setStoreName(store.store_name); setOnboarded(true) }
      else setOnboarded(false)
    })()
    return () => { active = false }
  }, [userId])

  if (!authReady) return <div className="auth-loading">Memeriksa sesi PesanAja…</div>
  if (supabase && !userId) return <Auth onSignedIn={setUserId}/>
  if (userRole === 'buyer') return <BuyerStore userId={userId} onSignOut={async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }
    setUserId(null)
  }}/>
  if (!onboarded) return <Onboarding initialStoreName={registeredStoreName} initialOwnerName={registeredOwnerName} initialPhone={registeredPhone} onComplete={name => { setStoreName(name); setOnboarded(true) }}/>
  if (!userId) return <div className="auth-loading">Sesi penjual tidak tersedia.</div>
  return <SellerWorkspace userId={userId} storeName={storeName} onSignOut={() => { void supabase?.auth.signOut().then(({ error }) => {
    if (error) { console.error('Gagal keluar:', error.message); return }
    setUserId(null)
  }) }}/>
}

export default App
