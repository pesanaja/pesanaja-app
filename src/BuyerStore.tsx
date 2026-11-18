import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Camera, Check, ClipboardList, Clock3, ImagePlus, LogOut,
  Minus, Plus, Search, ShoppingCart, Store, Trash2, UserRound,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { getOwnedProfileImagePath, removeProfileImage, uploadProfileImage, validateProfileImage } from './lib/profileImages'
import { validatePaymentProof, type PaymentProofMime } from './lib/paymentProof'
import { isValidPersonName, normalizePersonName } from './lib/nameValidation'
import Education from './Education'

type Product = {
  id: string
  batchId: string
  batchName: string
  storeId: string
  storeName: string
  name: string
  category: string
  variants: string[]
  description: string
  imageUrl: string | null
  price: number
  stock: number | null
  stockLimit: number | null
  closesAt: string | null
  paymentDetails: string | null
  qrisImagePath: string | null
  pickupLocation: string | null
}
type CartLine = { product: Product; quantity: number; variant: string | null }
type Page = 'home' | 'detail' | 'store' | 'cart' | 'checkout' | 'done' | 'education' | 'profile' | 'orders'
type PaymentMethod = 'qris' | 'transfer' | 'cash'
type PaymentPlan = 'full' | 'installment'
type CreatedOrder = { orderId: string; paymentId: string; orderNumber: string; total: number }
type BuyerPayment = { id: string; amount: number; status: string; method: string | null; proof_url: string | null; installment_number: number | null; due_at: string | null }
type BuyerOrderItem = { product_name: string; variant: string | null; quantity: number; line_total: number }
type BuyerOrder = { id: string; order_number: string; status: string; total: number; created_at: string; received_at: string | null; store: { store_name: string } | null; order_items: BuyerOrderItem[]; payments: BuyerPayment[] }
type CatalogSort = 'recommended' | 'price-asc' | 'price-desc'
type CatalogRow = {
  batch_id: string
  price: number
  stock_limit: number | null
  product: { id: string; store_id: string; name: string; description: string | null; category: string | null; variants: string[]; image_url: string | null; stock: number | null } | null
  batch: { id: string; name: string; store_id: string; closes_at: string | null } | null
}
type StoreRow = { user_id: string; store_name: string; description: string | null; payment_details: string | null; qris_image_path: string | null; pickup_location: string | null; logo_url: string | null }

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const orderStatusName = (status: string) => ({
  ordered: 'Belum bayar', unpaid: 'Belum bayar', installment: 'Dicicil',
  paid: 'Dibayar', completed: 'Dibayar', cancelled: 'Dibatalkan',
}[status] ?? status)
const paymentStatusName = (status: string) => status === 'paid' ? 'Dibayar' : 'Belum bayar'

export default function BuyerStore({ userId, onSignOut }: { userId: string | null; onSignOut: () => void | Promise<void> }) {
  const [page, setPage] = useState<Page>('home')
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [storeProfile, setStoreProfile] = useState<StoreRow | null>(null)
  const [storeProfileLoading, setStoreProfileLoading] = useState(false)
  const [detailQuantity, setDetailQuantity] = useState(1)
  const [selectedVariants, setSelectedVariants] = useState<string[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Semua kategori')
  const [storeFilter, setStoreFilter] = useState('Semua toko')
  const [catalogSort, setCatalogSort] = useState<CatalogSort>('recommended')
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileNotice, setProfileNotice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('full')
  const [proof, setProof] = useState<File | null>(null)
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
  const [buyerOrders, setBuyerOrders] = useState<BuyerOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [busyReceiptId, setBusyReceiptId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function signOut() {
    try { await onSignOut() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal keluar. Coba lagi.') }
  }

  const loadStore = useCallback(async (showLoading = true) => {
    if (!supabase) {
      setError('Koneksi Supabase belum tersedia.')
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setError('')
    const { data, error: catalogError } = await supabase
      .from('batch_products')
      .select('batch_id,price,stock_limit,product:products!inner(id,store_id,name,description,category,variants,image_url,stock),batch:preorder_batches!inner(id,name,store_id,closes_at)')
      .eq('batch.status', 'open')
      .eq('product.is_active', true)
    if (catalogError) {
      setError(`Produk gagal dimuat: ${catalogError.message}`)
      setLoading(false)
      return
    }
    const rows = (data ?? []) as unknown as CatalogRow[]
    const storeIds = [...new Set(rows.flatMap(row => row.product?.store_id ? [row.product.store_id] : []))]
    const storesResult = storeIds.length
      ? await supabase.from('seller_profiles').select('user_id,store_name,description,payment_details,qris_image_path,pickup_location').in('user_id', storeIds)
      : { data: [], error: null }
    if (storesResult.error) {
      setError(`Informasi toko gagal dimuat: ${storesResult.error.message}`)
      setLoading(false)
      return
    }
    const stores = new Map(((storesResult.data ?? []) as unknown as StoreRow[]).map(store => [store.user_id, store]))
    const catalog = rows.flatMap(row => {
      if (!row.product || !row.batch || row.stock_limit === 0 || row.product.stock === 0 || !stores.has(row.product.store_id) || (row.batch.closes_at && new Date(row.batch.closes_at) <= new Date())) return []
      const store = stores.get(row.product.store_id)
      const stockLimits = [row.stock_limit, row.product.stock].filter((limit): limit is number => limit !== null)
      return [{
        id: row.product.id,
        batchId: row.batch_id,
        batchName: row.batch.name,
        storeId: row.product.store_id,
        storeName: store?.store_name ?? 'Toko kampus',
        name: row.product.name,
        category: row.product.category ?? 'Produk',
        variants: row.product.variants ?? [],
        description: row.product.description ?? 'Produk pre-order pilihan dari toko kampus.',
        imageUrl: row.product.image_url,
        price: row.price,
        stock: row.product.stock,
        stockLimit: stockLimits.length ? Math.min(...stockLimits) : null,
        closesAt: row.batch.closes_at,
        paymentDetails: store?.payment_details ?? null,
        qrisImagePath: store?.qris_image_path ?? null,
        pickupLocation: store?.pickup_location ?? null,
      }]
    })
    setProducts(catalog)
    setLoading(false)
    if (userId) {
      const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
      if (profileError) setError(`Profil pembeli gagal dimuat: ${profileError.message}`)
      else if (profile?.full_name) setBuyerName(profile.full_name)
    }
  }, [userId])

  useEffect(() => { void loadStore() }, [loadStore])

  const loadBuyerOrders = useCallback(async () => {
    if (!supabase || !userId) {
      setOrdersError('Sesi pembeli tidak tersedia. Silakan masuk kembali.')
      setOrdersLoading(false)
      return
    }
    setOrdersLoading(true)
    setOrdersError('')
    const { data, error: loadError } = await supabase
      .from('orders')
      .select('id,order_number,status,total,created_at,received_at,store:seller_profiles!orders_store_id_fkey(store_name),order_items(product_name,variant,quantity,line_total),payments(id,amount,status,method,proof_url,installment_number,due_at)')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
    if (loadError) setOrdersError(`Pesanan gagal dimuat: ${loadError.message}`)
    else setBuyerOrders((data ?? []) as unknown as BuyerOrder[])
    setOrdersLoading(false)
  }, [userId])

  useEffect(() => {
    if (page === 'orders') void loadBuyerOrders()
  }, [page, loadBuyerOrders])

  useEffect(() => {
    if (page !== 'profile') return
    const client = supabase
    if (!client || !userId) {
      setError('Sesi pembeli tidak tersedia. Silakan masuk kembali.')
      return
    }

    let active = true
    async function loadBuyerProfile(client: NonNullable<typeof supabase>) {
      setProfileLoading(true)
      setProfileNotice('')
      setError('')
      const [profileResult, authResult] = await Promise.all([
        client.from('profiles').select('full_name,phone,avatar_url').eq('id', userId).maybeSingle(),
        client.auth.getUser(),
      ])
      if (!active) return
      setProfileLoading(false)
      if (profileResult.error) {
        setError(`Profil pembeli gagal dimuat: ${profileResult.error.message}`)
        return
      }
      if (authResult.error) {
        setError(`Email akun gagal dimuat: ${authResult.error.message}`)
        return
      }
      const profile = profileResult.data
      setProfileName(profile?.full_name ?? '')
      setProfilePhone(profile?.phone ?? '')
      setProfileAvatar(profile?.avatar_url ?? null)
      setBuyerEmail(authResult.data.user.email ?? '')
    }
    void loadBuyerProfile(client)
    return () => { active = false }
  }, [page, userId])

  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
  }, [avatarPreview])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadStore(false)
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadStore])

  const categories = useMemo(() => [...new Set(products.map(product => product.category))].sort((a, b) => a.localeCompare(b, 'id')), [products])
  const stores = useMemo(() => [...new Map(products.map(product => [product.storeId, product.storeName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id')), [products])
  const visibleProducts = useMemo(() => {
    const filtered = products.filter(product =>
      `${product.name} ${product.storeName} ${product.category}`.toLowerCase().includes(search.trim().toLowerCase())
      && (categoryFilter === 'Semua kategori' || product.category === categoryFilter)
      && (storeFilter === 'Semua toko' || product.storeId === storeFilter),
    )
    if (catalogSort === 'price-asc') return filtered.sort((a, b) => a.price - b.price)
    if (catalogSort === 'price-desc') return filtered.sort((a, b) => b.price - a.price)
    return filtered
  }, [products, search, categoryFilter, storeFilter, catalogSort])
  const cartTotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0)
  const firstInstallment = Math.ceil(cartTotal / 2)
  const remainingInstallments = cartTotal - firstInstallment
  const secondInstallment = Math.ceil(remainingInstallments / 2)
  const thirdInstallment = remainingInstallments - secondInstallment
  const openProduct = (product: Product) => {
    setSelected(product)
    const cartLines = cart.filter(line => line.product.id === product.id)
    setDetailQuantity(cartLines[0]?.quantity ?? 1)
    const selected = cartLines.flatMap(line => line.variant ? [line.variant] : [])
    setSelectedVariants(selected.length ? selected : product.variants.slice(0, 1))
    setError('')
    setPage('detail')
  }
  async function openStoreProfile(storeId: string) {
    if (!supabase) return
    setError('')
    setStoreProfile(null)
    setStoreProfileLoading(true)
    setPage('store')
    const { data, error: profileError } = await supabase
      .from('seller_profiles')
      .select('user_id,store_name,description,payment_details,qris_image_path,pickup_location,logo_url')
      .eq('user_id', storeId)
      .maybeSingle()
    setStoreProfileLoading(false)
    if (profileError) {
      setError(`Profil penjual gagal dimuat: ${profileError.message}`)
      return
    }
    if (!data) {
      setError('Profil penjual tidak ditemukan atau belum terverifikasi.')
      return
    }
    setStoreProfile(data as StoreRow)
    setPage('store')
  }
  function openEducation() {
    setError('')
    setPage('education')
  }
  const changeQuantity = (product: Product, variant: string | null, change: number) => {
    setCart(current => {
      const currentLine = current.find(line => line.product.id === product.id && line.variant === variant)
      if (!currentLine) return current
      const otherQuantity = current
        .filter(line => line.product.id === product.id && line.variant !== variant)
        .reduce((total, line) => total + line.quantity, 0)
      const limit = product.stockLimit ?? 99
      const quantity = Math.min(Math.max(0, limit - otherQuantity), Math.max(0, currentLine.quantity + change))
      return current.flatMap(line => {
        if (line.product.id !== product.id || line.variant !== variant) return [line]
        return quantity ? [{ ...line, quantity }] : []
      })
    })
  }
  const addToCart = (product: Product, quantity = 1, variants: string[] = []) => {
    if (product.variants.length && !variants.length) {
      setError('Pilih minimal satu varian produk terlebih dahulu.')
      return
    }
    if (cart.length && cart[0].product.batchId !== product.batchId) {
      setError('Keranjang hanya bisa berisi produk dari satu batch pre-order.')
      return
    }
    const selections = product.variants.length ? variants : [null]
    const currentQuantity = cart
      .filter(line => line.product.id === product.id)
      .reduce((total, line) => total + line.quantity, 0)
    const additionalQuantity = selections.reduce((total, variant) => {
      const existing = cart.find(line => line.product.id === product.id && line.variant === variant)
      return total + Math.max(0, quantity - (existing?.quantity ?? 0))
    }, 0)
    if (product.stockLimit !== null && currentQuantity + additionalQuantity > product.stockLimit) {
      setError(`Jumlah melebihi stok tersedia (${product.stockLimit}). Kurangi jumlah atau pilihan varian.`)
      return
    }
    setCart(current => {
      const updated = [...current]
      for (const variant of selections) {
        const existingIndex = updated.findIndex(line => line.product.id === product.id && line.variant === variant)
        const line = { product, quantity: Math.min(product.stockLimit ?? 99, quantity), variant }
        if (existingIndex >= 0) updated[existingIndex] = line
        else updated.push(line)
      }
      return updated
    })
    setError('')
    setPage('cart')
  }

  async function uploadProof(order: CreatedOrder, file: File, contentType: PaymentProofMime) {
    if (!supabase || !userId) throw new Error('Silakan masuk kembali sebelum mengunggah bukti pembayaran.')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${userId}/${order.orderId}/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, file, { contentType, upsert: false })
    if (uploadError) throw uploadError
    const { error: proofError } = await supabase.rpc('attach_payment_proof', { p_payment_id: order.paymentId, p_proof_path: path })
    if (proofError) throw proofError
  }

  async function uploadInstallmentProof(orderId: string, paymentId: string, file: File, contentType: PaymentProofMime) {
    if (!supabase || !userId) {
      setOrdersError('Silakan masuk kembali sebelum mengunggah bukti pembayaran.')
      return
    }
    setBusyPaymentId(paymentId)
    setOrdersError('')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${userId}/${orderId}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, file, { contentType, upsert: false })
      if (uploadError) throw uploadError
      const { error: attachError } = await supabase.rpc('attach_payment_proof', { p_payment_id: paymentId, p_proof_path: path })
      if (attachError) throw attachError
      await loadBuyerOrders()
    } catch (cause) {
      setOrdersError(cause instanceof Error ? cause.message : 'Bukti pembayaran gagal diunggah.')
    } finally {
      setBusyPaymentId(null)
    }
  }

  async function cancelBuyerOrder(orderId: string) {
    if (!supabase || !window.confirm('Batalkan pesanan ini?')) return
    setBusyOrderId(orderId)
    setOrdersError('')
    const { error: cancelError } = await supabase.rpc('cancel_buyer_order', { p_order_id: orderId })
    if (cancelError) setOrdersError(`Pesanan gagal dibatalkan: ${cancelError.message}`)
    else await loadBuyerOrders()
    setBusyOrderId(null)
  }

  async function confirmOrderReceived(orderId: string) {
    if (!supabase) return
    setBusyReceiptId(orderId)
    setOrdersError('')
    const { error: receiveError } = await supabase.rpc('confirm_order_received', { p_order_id: orderId })
    if (receiveError) setOrdersError(`Konfirmasi penerimaan gagal: ${receiveError.message}`)
    else await loadBuyerOrders()
    setBusyReceiptId(null)
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setProfileNotice('')
    if (!supabase || !userId) { setError('Silakan masuk kembali untuk melanjutkan pembayaran.'); return }
    if (!paymentMethod) { setError('Pilih metode pembayaran terlebih dahulu.'); return }
    if (paymentMethod === 'qris' && !cart[0]?.product.qrisImagePath) { setError('Penjual belum memiliki QRIS. Pilih transfer atau hubungi penjual.'); return }
    if (paymentMethod === 'transfer' && !cart[0]?.product.paymentDetails?.trim()) { setError('Penjual belum mengisi informasi rekening. Pilih metode lain atau hubungi penjual.'); return }
    if (paymentMethod !== 'cash' && !proof) { setError('Unggah bukti pembayaran untuk melanjutkan.'); return }
    if (!isValidPersonName(buyerName)) { setError('Nama pada profil harus berisi huruf. Perbarui nama di profil pembeli sebelum membayar.'); return }
    setSaving(true)
    try {
      const proofMime = paymentMethod !== 'cash' && proof ? await validatePaymentProof(proof) : null
      let order = createdOrder
      if (!order) {
        const { data, error: orderError } = await supabase.rpc(paymentPlan === 'installment' ? 'create_buyer_installment_order' : 'create_buyer_order', {
          p_batch_id: cart[0].product.batchId,
          p_items: cart.map(line => ({ product_id: line.product.id, quantity: line.quantity, variant: line.variant })),
          p_method: paymentMethod,
        })
        if (orderError) throw orderError
        const row = Array.isArray(data) ? data[0] as { order_id: string; payment_id: string; order_number: string; total: number } | undefined : undefined
        if (!row?.order_id || !row.payment_id || !row.order_number) throw new Error('Pesanan belum dapat dibuat. Coba lagi.')
        order = { orderId: row.order_id, paymentId: row.payment_id, orderNumber: row.order_number, total: row.total }
        setCreatedOrder(order)
      }
      if (paymentMethod !== 'cash' && proof && proofMime) await uploadProof(order, proof, proofMime)
      setPage('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pembayaran belum berhasil dikirim. Coba lagi.')
    } finally { setSaving(false) }
  }

  const startCheckout = () => {
    setPaymentMethod(null)
    setPaymentPlan('full')
    setProof(null)
    setCreatedOrder(null)
    setError('')
    setPage('checkout')
  }

  async function saveBuyerProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!supabase || !userId) {
      setError('Sesi pembeli tidak tersedia. Silakan masuk kembali.')
      return
    }
    if (!isValidPersonName(profileName)) {
      setError('Nama pembeli harus berisi huruf dan hanya boleh memakai spasi, tanda hubung, atau apostrof.')
      return
    }
    setProfileSaving(true)
    let uploadedPath: string | null = null
    try {
      let avatarUrl = profileAvatar
      if (avatarFile) {
        const uploaded = await uploadProfileImage(userId, avatarFile)
        uploadedPath = uploaded.path
        avatarUrl = uploaded.url
      }
      const { error: saveError } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: normalizePersonName(profileName),
        phone: profilePhone.trim() || null,
        avatar_url: avatarUrl,
      }, { onConflict: 'id' })
      if (saveError) {
        if (uploadedPath) {
          try { await removeProfileImage(uploadedPath) }
          catch (cleanupError) { throw new Error(`Profil gagal disimpan: ${saveError.message}. ${cleanupError instanceof Error ? cleanupError.message : 'Foto baru gagal dibersihkan.'}`) }
        }
        throw new Error(`Profil gagal disimpan: ${saveError.message}`)
      }
      const oldPath = avatarFile ? getOwnedProfileImagePath(profileAvatar, userId) : null
      setBuyerName(normalizePersonName(profileName))
      setProfileAvatar(avatarUrl)
      setAvatarFile(null)
      setAvatarPreview('')
      setProfileNotice('Profil berhasil diperbarui.')
      if (oldPath) {
        try { await removeProfileImage(oldPath) }
        catch (cleanupError) { setProfileNotice(`Profil tersimpan, tetapi foto lama gagal dihapus: ${cleanupError instanceof Error ? cleanupError.message : 'Terjadi kesalahan.'}`) }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profil gagal disimpan. Coba lagi.')
    } finally {
      setProfileSaving(false)
    }
  }

  return <main className="storefront">
    <header className="storefront-nav">
      <button className="storefront-logo" onClick={() => setPage('home')} aria-label="Kembali ke beranda">
        <img src="/assets/pesanaja-logo.svg" alt="PesanAja" />
      </button>
      <nav><button className={page === 'education' ? 'selected' : ''} onClick={openEducation}>Edukasi</button><button className={page !== 'education' ? 'selected' : ''} onClick={() => setPage('home')}>Belanja</button></nav>
      <div className="storefront-actions">
        <button className={`storefront-orders-shortcut ${page === 'orders' ? 'active' : ''}`} aria-label="Pesanan Saya" title="Pesanan Saya" onClick={() => setPage('orders')}><ClipboardList size={16}/><span>Pesanan Saya</span></button>
        <button className="storefront-cart-link" aria-label={`Keranjang, ${cartCount} produk`} onClick={() => setPage('cart')}><ShoppingCart size={21}/>{cartCount > 0 && <span>{cartCount}</span>}</button>
        <button className={`storefront-buyer-name ${page === 'profile' ? 'is-active' : ''}`} onClick={() => { setError(''); setPage('profile') }}>{profileAvatar ? <img src={profileAvatar} alt=""/> : <UserRound size={16}/>}<span>{buyerName || 'Pembeli'}</span></button>
        <button className="storefront-signout" aria-label="Keluar" onClick={() => void signOut()}><LogOut size={17}/></button>
      </div>
    </header>

    {page === 'home' && <section className="storefront-home">
      <div className="storefront-welcome"><h1>Selamat Pagi!</h1><h2>Lagi pengen jajan apa?</h2></div>
      <div className="catalog-toolbar">
        <label className="storefront-search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari produk atau toko"/><span>Cari</span></label>
        <label className="catalog-filter">Toko<select value={storeFilter} onChange={event => setStoreFilter(event.target.value)}><option>Semua toko</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label className="catalog-filter">Urutkan<select value={catalogSort} onChange={event => setCatalogSort(event.target.value as CatalogSort)}><option value="recommended">Rekomendasi</option><option value="price-asc">Harga terendah</option><option value="price-desc">Harga tertinggi</option></select></label>
      </div>
      {categories.length > 0 && <div className="catalog-category-filter">
        <span className="catalog-category-label">Kategori produk</span>
        <div className="catalog-categories" role="group" aria-label="Filter kategori produk">
          <button type="button" className={categoryFilter === 'Semua kategori' ? 'selected' : ''} aria-pressed={categoryFilter === 'Semua kategori'} onClick={() => setCategoryFilter('Semua kategori')}>Semua</button>
          {categories.map(category => <button type="button" key={category} className={categoryFilter === category ? 'selected' : ''} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{category}</button>)}
        </div>
      </div>}
      {error && <p className="storefront-error" role="alert">{error}</p>}
      {loading ? <div className="storefront-empty">Memuat produk…</div> : visibleProducts.length ? <div className="storefront-grid">
        {visibleProducts.map(product => <article className="store-product-card" key={`${product.batchId}-${product.id}`}>
          <button className="store-product-open" onClick={() => openProduct(product)}>
            <ProductImage product={product}/>
            <div className="store-product-title"><strong>{product.name}</strong><span><Store size={13}/>{product.category}</span></div>
            <small className="store-product-batch">{product.batchName} · {product.storeName}</small>
            <b className="store-product-price">{money(product.price)}<small> /pcs</small></b>
          </button>
          <button className="store-pill-button" onClick={() => openProduct(product)}>Beli</button>
        </article>)}
      </div> : <div className="storefront-empty"><div>🧺</div><h2>{products.length ? 'Produk tidak ditemukan' : 'Belum ada pre-order aktif'}</h2><p>{products.length ? 'Coba ubah kata kunci atau filter katalog.' : 'Produk dari toko kampus akan muncul di sini saat batch pre-order dibuka.'}</p>{products.length > 0 && <button className="store-pill-button" onClick={() => { setSearch(''); setCategoryFilter('Semua kategori'); setStoreFilter('Semua toko'); setCatalogSort('recommended') }}>Hapus filter</button>}</div>}
      <footer className="storefront-footer"><img src="/assets/pesanaja-logo-concept.svg" alt="PesanAja"/><small>© 2026 PesanAja Indonesia</small></footer>
    </section>}

    {page === 'education' && <section className="storefront-page education-page"><Education role="buyer"/></section>}

    {page === 'orders' && <section className="storefront-page buyer-orders-page">
      <button className="storefront-back" onClick={() => setPage('home')}><ArrowLeft size={18}/> Kembali</button>
      <header className="buyer-orders-heading"><div><span>PESANAJA</span><h1>Pesanan Saya</h1><p>Lihat status pesanan dan jadwal pembayaranmu.</p></div><button className="storefront-refresh" onClick={() => void loadBuyerOrders()} disabled={ordersLoading}>Muat ulang</button></header>
      {ordersError && <p className="storefront-error" role="alert">{ordersError}</p>}
      {ordersLoading ? <div className="storefront-empty">Memuat pesanan…</div> : buyerOrders.length ? <div className="buyer-orders-list">
        {buyerOrders.map(order => {
          const orderPayments = [...(order.payments ?? [])].sort((a, b) => (a.installment_number ?? 1) - (b.installment_number ?? 1))
          const canCancel = ['unpaid', 'ordered', 'installment'].includes(order.status) && !orderPayments.some(payment => payment.status === 'paid')
          const canConfirmReceipt = ['paid', 'completed'].includes(order.status) && !order.received_at
          return <article className="buyer-order-card" key={order.id}>
            <header><div><b>{order.order_number}</b><small>{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><span className={`buyer-order-status ${order.received_at ? 'received' : order.status}`}>{order.received_at ? 'Pesanan diterima' : orderStatusName(order.status)}</span></header>
            <p className="buyer-order-store">Penjual: <b>{order.store?.store_name ?? 'Toko kampus'}</b></p>
            <div className="buyer-order-items">{(order.order_items ?? []).map((item, index) => <div key={`${item.product_name}-${item.variant ?? ''}-${index}`}><span>{item.product_name}{item.variant ? ` · ${item.variant}` : ''} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div>
            <div className="buyer-order-total"><span>Total pesanan</span><b>{money(order.total)}</b></div>
            {orderPayments.length > 0 && <div className="buyer-installment-list">{orderPayments.map(payment => {
              const previousUnpaid = payment.installment_number !== null && orderPayments.some(previous => (previous.installment_number ?? 0) < payment.installment_number! && previous.status !== 'paid')
              const due = payment.due_at ? new Date(payment.due_at).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : null
              return <div className="buyer-installment-row" key={payment.id}>
                <div><b>{payment.installment_number ? `Cicilan ${payment.installment_number} dari 3` : 'Pembayaran'}</b><span>{due ? `Jatuh tempo ${due}` : payment.method === 'cash' ? 'Bayar tunai ke penjual' : 'Unggah bukti setelah membayar'}</span></div>
                <strong>{money(payment.amount)}</strong>
                <span className={`buyer-payment-status ${payment.status === 'paid' ? 'paid' : ''}`}>{paymentStatusName(payment.status)}</span>
                {payment.status !== 'paid' && payment.method !== 'cash' && !payment.proof_url && !previousUnpaid && order.status !== 'cancelled' && <label className="buyer-proof-upload">
                  <input type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" disabled={busyPaymentId === payment.id} onChange={event => {
                    const file = event.target.files?.[0] ?? null
                    event.target.value = ''
                    if (!file) return
                    void validatePaymentProof(file)
                      .then(contentType => uploadInstallmentProof(order.id, payment.id, file, contentType))
                      .catch(cause => setOrdersError(cause instanceof Error ? cause.message : 'Format bukti pembayaran tidak valid.'))
                  }}/>
                  {busyPaymentId === payment.id ? 'Mengunggah…' : 'Unggah bukti'}
                </label>}
                {payment.proof_url && payment.status !== 'paid' && <small className="buyer-proof-pending">Menunggu konfirmasi penjual</small>}
                {payment.status !== 'paid' && payment.method === 'cash' && <small className="buyer-proof-pending">Konfirmasi setelah dibayar tunai</small>}
                {previousUnpaid && payment.status !== 'paid' && <small className="buyer-proof-pending">Selesaikan cicilan sebelumnya terlebih dahulu</small>}
              </div>
            })}</div>}
            {canCancel && <button className="buyer-cancel-order" disabled={busyOrderId === order.id} onClick={() => void cancelBuyerOrder(order.id)}>{busyOrderId === order.id ? 'Membatalkan…' : 'Batalkan pesanan'}</button>}
            {canConfirmReceipt && <button className="buyer-received-button" disabled={busyReceiptId === order.id} onClick={() => void confirmOrderReceived(order.id)}>{busyReceiptId === order.id ? 'Menyimpan…' : 'Konfirmasi pesanan diterima'}</button>}
            {order.received_at && <small className="buyer-received-time">Dikonfirmasi {new Date(order.received_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</small>}
          </article>
        })}
      </div> : <div className="storefront-empty"><div>🧾</div><h2>Belum ada pesanan</h2><p>Pesanan dan status pembayarannya akan tampil di sini.</p><button className="store-pill-button" onClick={() => setPage('home')}>Mulai belanja</button></div>}
    </section>}

    {page === 'profile' && <section className="storefront-page buyer-profile-page">
      <button className="storefront-back" onClick={() => setPage('home')}><ArrowLeft size={18}/> Kembali</button>
      <h1 className="buyer-profile-title">Profil Pembeli</h1>
      <form className="buyer-profile-card" onSubmit={saveBuyerProfile}>
        <header className="buyer-profile-card-heading"><div><h2>Informasi akun</h2><p>Kelola nama, kontak, dan foto profilmu.</p></div><span className="buyer-role-tag">Pembeli</span></header>
        <div className="buyer-avatar-editor">
          <span className="buyer-avatar-preview">{avatarPreview || profileAvatar ? <img src={avatarPreview || profileAvatar || ''} alt="Pratinjau foto profil"/> : <UserRound size={25}/>}</span>
          <div><b>Foto profil</b><small>JPG, PNG, atau WEBP · Maks. 5 MB</small><label className="buyer-avatar-upload" htmlFor="buyer-profile-avatar"><Camera size={15}/> Pilih foto</label><input id="buyer-profile-avatar" className="profile-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.target.files?.[0] ?? null
            if (file) {
              const validationError = validateProfileImage(file)
              if (validationError) { setError(validationError); event.target.value = ''; return }
            }
            setError('')
            setAvatarFile(file)
            setAvatarPreview(file ? URL.createObjectURL(file) : '')
            event.target.value = ''
          }}/></div>
        </div>
        <label>Nama lengkap<input required maxLength={120} autoComplete="name" value={profileName} onChange={event => setProfileName(event.target.value)} placeholder="Nama lengkap" disabled={profileLoading}/></label>
        <label>Email akun<input type="email" value={buyerEmail} readOnly aria-readonly="true" placeholder="Email akun" disabled={profileLoading}/><small>Email digunakan untuk masuk dan tidak dapat diubah di sini.</small></label>
        <label>Nomor WhatsApp<input type="tel" maxLength={30} autoComplete="tel" value={profilePhone} onChange={event => setProfilePhone(event.target.value)} placeholder="08xxxxxxxxxx" disabled={profileLoading}/></label>
        {error && <p className="storefront-error" role="alert">{error}</p>}
        {profileNotice && <p className="buyer-profile-success" role="status">{profileNotice}</p>}
        <div className="buyer-profile-actions"><button className="storefront-profile-logout" type="button" onClick={() => void signOut()}><LogOut size={15}/> Keluar</button><button className="store-pill-button" type="submit" disabled={profileLoading || profileSaving}>{profileSaving ? 'Menyimpan…' : 'Simpan profil'}</button></div>
      </form>
    </section>}

    {page === 'detail' && selected && <section className="storefront-page storefront-detail">
      <button className="storefront-back" onClick={() => setPage('home')}><ArrowLeft size={18}/> Kembali</button>
      <div className="detail-layout"><ProductImage product={selected} large/>
        <div className="detail-info"><h1>{selected.name}</h1>
          <p className="detail-deadline"><Clock3 size={17}/>{selected.closesAt ? `Tutup ${new Date(selected.closesAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}` : 'Pre-order sedang dibuka'}</p>
          <strong className="detail-price">{money(selected.price)}</strong>
          <div className="detail-seller"><button className="detail-store" onClick={() => void openStoreProfile(selected.storeId)} aria-label={`Lihat profil toko ${selected.storeName}`}><span className="detail-store-mark">{selected.storeName.slice(0, 1).toUpperCase()}</span><b>{selected.storeName}</b></button></div>
          {selected.variants.length > 0 && <fieldset className="detail-variant-select"><legend>Pilih satu atau beberapa varian</legend>{selected.variants.map(variant => <label key={variant}><input type="checkbox" checked={selectedVariants.includes(variant)} onChange={event => setSelectedVariants(current => event.target.checked ? [...current, variant] : current.filter(value => value !== variant))}/>{variant}</label>)}</fieldset>}
          <div className="detail-buy-row"><div className="quantity-control"><button aria-label="Kurangi jumlah" disabled={detailQuantity <= 1} onClick={() => setDetailQuantity(value => Math.max(1, value - 1))}><Minus size={14}/></button><b>{detailQuantity}</b><button aria-label="Tambah jumlah" disabled={selected.stockLimit !== null && detailQuantity >= selected.stockLimit} title={selected.stockLimit !== null && detailQuantity >= selected.stockLimit ? 'Batas stok produk tercapai' : 'Tambah jumlah'} onClick={() => setDetailQuantity(value => Math.min(selected.stockLimit ?? 99, value + 1))}><Plus size={14}/></button></div><button className="store-pill-button" onClick={() => addToCart(selected, detailQuantity, selectedVariants)}>Masukkan keranjang</button></div>
          {selected.stockLimit !== null && <small className="product-stock-note">Batas jumlah pesanan produk ini: {selected.stockLimit}</small>}
        </div>
      </div>
      <section className="detail-description"><h2>Deskripsi</h2><p>{selected.description}</p><p><b>Batch:</b> {selected.batchName}</p>{selected.pickupLocation && <p><b>Lokasi pengambilan:</b> {selected.pickupLocation}</p>}</section>
      {error && <p className="storefront-error" role="alert">{error}</p>}
    </section>}

    {page === 'store' && <section className="storefront-page storefront-store-profile">
      <button className="storefront-back" onClick={() => setPage(selected ? 'detail' : 'home')}><ArrowLeft size={18}/> Kembali</button>
      {storeProfileLoading ? <div className="storefront-empty">Memuat profil toko…</div> : storeProfile ? <>
        <header className="store-profile-heading"><span className="detail-store-mark">{storeProfile.logo_url ? <img src={storeProfile.logo_url} alt=""/> : storeProfile.store_name.slice(0, 1).toUpperCase()}</span><div><span>PROFIL PENJUAL</span><h1>{storeProfile.store_name}</h1></div></header>
        <div className="store-profile-details">{storeProfile.description && <p>{storeProfile.description}</p>}{storeProfile.pickup_location && <p><b>Lokasi pengambilan:</b> {storeProfile.pickup_location}</p>}</div>
        <h2 className="store-profile-products-title">Produk toko</h2>
        {products.filter(product => product.storeId === storeProfile.user_id).length ? <div className="storefront-grid">{products.filter(product => product.storeId === storeProfile.user_id).map(product => <article className="store-product-card" key={`${product.batchId}-${product.id}`}><button className="store-product-open" onClick={() => openProduct(product)}><ProductImage product={product}/><div className="store-product-title"><strong>{product.name}</strong><span><Store size={13}/>{product.category}</span></div><small className="store-product-batch">{product.batchName}</small><b className="store-product-price">{money(product.price)}<small> /pcs</small></b></button><button className="store-pill-button" onClick={() => openProduct(product)}>Lihat produk</button></article>)}</div> : <div className="storefront-empty">Belum ada produk aktif di batch terbuka.</div>}
      </> : error && <p className="storefront-error" role="alert">{error}</p>}
    </section>}

    {page === 'cart' && <section className="storefront-page storefront-cart-page">
      <h1>Keranjang ({cartCount})</h1>
      {cart.length ? <>
        <div className="cart-store-name"><span>{cart[0].product.storeName.slice(0, 1).toUpperCase()}</span><b>{cart[0].product.storeName}</b></div>
        {cart.map(line => <article className="cart-line" key={`${line.product.id}-${line.variant ?? 'default'}`}>
          <ProductImage product={line.product}/>
          <div className="cart-line-info"><button onClick={() => openProduct(line.product)}>{line.product.name}</button>{line.variant && <p>Varian: {line.variant}</p>}<p>Batch: {line.product.batchName}</p>{line.product.stockLimit !== null && <p>Batas jumlah: {line.product.stockLimit}</p>}<strong>{money(line.product.price * line.quantity)}</strong></div>
          <div className="quantity-control"><button aria-label="Kurangi jumlah" onClick={() => changeQuantity(line.product, line.variant, -1)}><Minus size={14}/></button><b>{line.quantity}</b><button aria-label="Tambah jumlah" disabled={line.product.stockLimit !== null && cart.filter(item => item.product.id === line.product.id).reduce((total, item) => total + item.quantity, 0) >= line.product.stockLimit} onClick={() => changeQuantity(line.product, line.variant, 1)}><Plus size={14}/></button></div>
          <button className="cart-remove" aria-label={`Hapus ${line.product.name}${line.variant ? ` varian ${line.variant}` : ''}`} onClick={() => setCart(current => current.filter(item => item.product.id !== line.product.id || item.variant !== line.variant))}><Trash2 size={18}/></button>
        </article>)}
        <div className="cart-checkout-bar"><div><strong>{money(cartTotal)}</strong><span>{cartCount} produk</span></div><button className="store-pill-button" onClick={startCheckout}>Beli sekarang <ArrowRight size={17}/></button></div>
      </> : <div className="storefront-empty"><div>🛒</div><h2>Keranjang masih kosong</h2><p>Pilih produk yang kamu suka dan tambahkan ke keranjang.</p><button className="store-pill-button" onClick={() => setPage('home')}>Mulai belanja</button></div>}
    </section>}

    {page === 'checkout' && <section className="storefront-page checkout-page">
      <h1>Pembayaran</h1><form onSubmit={submitPayment}>
        <div className="checkout-columns"><div className="checkout-fields">
          <label className="checkout-label">Nama Lengkap<div className="checkout-input"><UserRound size={18}/><input value={buyerName} placeholder="Nama dari profil pembeli" readOnly aria-readonly="true" required/></div><small>Nama pembayaran mengikuti profil pembeli. Ubah nama dari menu profil jika perlu.</small></label>
          <fieldset className="payment-methods"><legend>Pilih skema pembayaran</legend>
            <label className="buyer-payment-plan"><input type="radio" name="payment-plan" checked={paymentPlan === 'full'} disabled={Boolean(createdOrder)} onChange={() => setPaymentPlan('full')}/><span>Bayar penuh</span></label>
            <label className="buyer-payment-plan"><input type="radio" name="payment-plan" checked={paymentPlan === 'installment'} disabled={Boolean(createdOrder)} onChange={() => setPaymentPlan('installment')}/><span>Cicilan: DP 50%, lalu 2 kali pembayaran mingguan</span></label>
            {paymentPlan === 'installment' && <p className="buyer-installment-hint">DP {money(firstInstallment)} sekarang, lalu {money(secondInstallment)} dalam 7 hari dan {money(thirdInstallment)} dalam 14 hari. Cicilan berikutnya baru dapat dikonfirmasi setelah cicilan sebelumnya. Pesanan yang sudah menerima pembayaran tidak dapat dibatalkan dari aplikasi.</p>}
          </fieldset>
          <fieldset className="payment-methods"><legend>Pilih Metode Pembayaran</legend>
            {([
              ['qris', 'QRIS', 'Ikuti petunjuk QRIS penjual, pastikan nama merchant dan nominal sesuai, lalu unggah bukti pembayaran.'],
              ['transfer', 'Transfer ke penjual', 'Transfer ke rekening/e-wallet penjual dan unggah bukti pembayaran.'],
              ['cash', 'Tunai', 'Bayar tunai kepada penjual saat mengambil pesanan.'],
            ] as const).map(([method, label, instruction]) => <div className={`payment-option ${paymentMethod === method ? 'expanded' : ''}`} key={method}>
              <label><input type="radio" name="payment-method" checked={paymentMethod === method} disabled={Boolean(createdOrder)} onChange={() => { setPaymentMethod(method); setError('') }}/><span>{label}</span></label>
              {paymentMethod === method && <div className="payment-instructions"><p>{instruction}</p>{method === 'qris' && (cart[0]?.product.qrisImagePath && supabase
                ? <img className="seller-qris-image" src={supabase.storage.from('seller-qris').getPublicUrl(cart[0].product.qrisImagePath).data.publicUrl} alt={`QRIS ${cart[0].product.storeName}`}/>
                : <p className="seller-payment-details">Penjual belum memiliki QRIS.</p>)}{method === 'transfer' && <p className="seller-payment-details">{cart[0]?.product.paymentDetails || 'Penjual belum mengisi informasi rekening. Hubungi penjual sebelum membayar.'}</p>}</div>}
            </div>)}
          </fieldset>
          {paymentMethod && paymentMethod !== 'cash'
            && (paymentMethod === 'qris' ? Boolean(cart[0]?.product.qrisImagePath) : Boolean(cart[0]?.product.paymentDetails?.trim())) && (
            <div className="checkout-label">
              <span>Bukti Pembayaran</span>
              <label className={`proof-upload ${proof ? 'has-file' : ''}`}>
                    <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null
                    setProof(file)
                    setError('')
                  }}
                />
                {proof ? <><Check size={21}/><span>{proof.name}</span></> : <><ImagePlus size={22}/><span>Unggah bukti pembayaran<br/><small>.png .jpg .pdf (maks. 5 MB)</small></span></>}
              </label>
            </div>
          )}
          {error && <p className="storefront-error" role="alert">{error}</p>}
        </div><aside className="checkout-summary"><h2>Informasi Produk</h2>{cart.map((line, index) => <div className="checkout-product" key={`${line.product.id}-${line.variant ?? 'default'}-${index}`}><ProductImage product={line.product}/><div><b>{line.product.name}</b><span>{line.product.category}</span>{line.variant && <span>Varian: {line.variant}</span>}<span>Qty: {line.quantity}</span><strong>{money(line.product.price * line.quantity)}</strong></div></div>)}<h2>Ringkasan Pesanan</h2><div className="summary-row"><span>Subtotal</span><span>{money(cartTotal)}</span></div><div className="summary-row"><span>Biaya Layanan</span><span>{money(0)}</span></div><div className="summary-total"><span>Total</span><strong>{money(cartTotal)}</strong></div></aside></div>
        <button className="store-pill-button checkout-submit" type="submit" disabled={saving}>{saving ? 'Memproses…' : createdOrder ? 'Coba unggah bukti lagi' : 'Konfirmasi'}</button>
      </form>
    </section>}

    {page === 'done' && createdOrder && <section className="storefront-success"><div className="payment-success-icon"><Check size={34}/></div><h1>{paymentPlan === 'installment' ? 'Pesanan dicicil' : paymentMethod === 'cash' ? 'Pesanan terkirim ke penjual' : 'Pembayaran terkirim ke penjual'}</h1><p>Pesanan <b>{createdOrder.orderNumber}</b> {paymentPlan === 'installment' ? 'dibuat dengan DP 50% dan dua cicilan mingguan. Lihat jadwal dan status di Pesanan Saya.' : `sudah masuk ke penjual${paymentMethod === 'cash' ? ' dan menunggu konfirmasi setelah pembayaran tunai diterima.' : ' dan menunggu konfirmasi setelah pembayaran diperiksa.'}`}</p><div className="success-order-total"><span>Total pesanan</span><b>{money(createdOrder.total)}</b></div><button className="store-pill-button" onClick={() => { setCart([]); setCreatedOrder(null); setProof(null); setPaymentMethod(null); setPaymentPlan('full'); setPage(paymentPlan === 'installment' ? 'orders' : 'home') }}>{paymentPlan === 'installment' ? 'Lihat Pesanan Saya' : 'Kembali ke beranda'}</button></section>}
  </main>
}

function ProductImage({ product, large = false }: { product: Product; large?: boolean }) {
  return <div className={`store-product-image ${large ? 'large' : ''}`}>
    {product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span className="product-image-placeholder">Foto belum tersedia</span>}
  </div>
}
