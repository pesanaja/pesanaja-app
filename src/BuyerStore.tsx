import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Clock3, ImagePlus, LogOut,
  Minus, Plus, RefreshCw, Search, ShoppingCart, Store, Trash2, UserRound,
} from 'lucide-react'
import { supabase } from './lib/supabase'

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
  stockLimit: number | null
  closesAt: string | null
  paymentDetails: string | null
  pickupLocation: string | null
}
type CartLine = { product: Product; quantity: number; variant: string | null }
type Page = 'home' | 'detail' | 'education' | 'education-detail' | 'store' | 'cart' | 'checkout' | 'done'
type PaymentMethod = 'qris' | 'transfer' | 'cash'
type CreatedOrder = { orderId: string; paymentId: string; orderNumber: string; total: number }
type CatalogRow = {
  batch_id: string
  price: number
  stock_limit: number | null
  product: { id: string; store_id: string; name: string; description: string | null; category: string | null; variants: string[]; image_url: string | null } | null
  batch: { id: string; name: string; store_id: string; closes_at: string | null } | null
}
type StoreRow = { user_id: string; store_name: string; description: string | null; payment_details: string | null; pickup_location: string | null }

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const buyerGuide = {
  title: 'Be a Smart Buyer!',
  intro: 'Belanja produk dari sesama mahasiswa memang menyenangkan. Mulai dari makanan homemade, minuman, merchandise, sampai berbagai produk hasil kreativitas mahasiswa lainnya. Namun, menjadi pembeli yang baik bukan hanya tentang menemukan produk yang menarik dan mendapatkan harga terbaik. Ada beberapa hal yang perlu diperhatikan agar transaksi berjalan lancar dan menguntungkan kedua belah pihak.',
  image: '/assets/education/buyer-guide-detail.png',
}

export default function BuyerStore({ userId, onSignOut }: { userId: string | null; onSignOut: () => void | Promise<void> }) {
  const [page, setPage] = useState<Page>('home')
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [storeProfile, setStoreProfile] = useState<StoreRow | null>(null)
  const [storeProfileLoading, setStoreProfileLoading] = useState(false)
  const [detailQuantity, setDetailQuantity] = useState(1)
  const [selectedVariant, setSelectedVariant] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [proof, setProof] = useState<File | null>(null)
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

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
      .select('batch_id,price,stock_limit,product:products!inner(id,store_id,name,description,category,variants,image_url),batch:preorder_batches!inner(id,name,store_id,status,closes_at)')
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
      ? await supabase.from('seller_profiles').select('user_id,store_name,description,payment_details,pickup_location').in('user_id', storeIds)
      : { data: [], error: null }
    if (storesResult.error) {
      setError(`Informasi toko gagal dimuat: ${storesResult.error.message}`)
      setLoading(false)
      return
    }
    const stores = new Map(((storesResult.data ?? []) as unknown as StoreRow[]).map(store => [store.user_id, store]))
    const catalog = rows.flatMap(row => {
      if (!row.product || !row.batch || row.stock_limit === 0 || !stores.has(row.product.store_id) || (row.batch.closes_at && new Date(row.batch.closes_at) <= new Date())) return []
      const store = stores.get(row.product.store_id)
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
        stockLimit: row.stock_limit,
        closesAt: row.batch.closes_at,
        paymentDetails: store?.payment_details ?? null,
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

  const visibleProducts = useMemo(() => products.filter(product =>
    `${product.name} ${product.storeName} ${product.category}`.toLowerCase().includes(search.toLowerCase()),
  ), [products, search])
  const cartTotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0)
  const openProduct = (product: Product) => {
    setSelected(product)
    const cartLine = cart.find(line => line.product.id === product.id)
    setDetailQuantity(cartLine?.quantity ?? 1)
    setSelectedVariant(cartLine?.variant ?? product.variants[0] ?? '')
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
      .select('user_id,store_name,description,payment_details,pickup_location')
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
  const changeQuantity = (product: Product, change: number) => {
    setCart(current => current.flatMap(line => {
      if (line.product.id !== product.id) return [line]
      const limit = product.stockLimit ?? 99
      const quantity = Math.min(limit, Math.max(0, line.quantity + change))
      return quantity ? [{ ...line, quantity }] : []
    }))
  }
  const addToCart = (product: Product, quantity = 1, variant: string | null = null) => {
    if (product.variants.length && !variant) {
      setError('Pilih varian produk terlebih dahulu.')
      return
    }
    if (cart.length && cart[0].product.batchId !== product.batchId) {
      setError('Keranjang hanya bisa berisi produk dari satu batch pre-order.')
      return
    }
    setCart(current => {
      const existing = current.find(line => line.product.id === product.id)
      if (existing) return current.map(line => line.product.id === product.id
        ? { ...line, quantity: Math.min(product.stockLimit ?? 99, quantity), variant }
        : line)
      return [...current, { product, quantity: Math.min(product.stockLimit ?? 99, quantity), variant }]
    })
    setError('')
    setPage('cart')
  }

  async function uploadProof(order: CreatedOrder, file: File) {
    if (!supabase || !userId) throw new Error('Silakan masuk kembali sebelum mengunggah bukti pembayaran.')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${userId}/${order.orderId}/${Date.now()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { error: proofError } = await supabase.rpc('attach_payment_proof', { p_payment_id: order.paymentId, p_proof_path: path })
    if (proofError) throw proofError
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!supabase || !userId) { setError('Silakan masuk kembali untuk melanjutkan pembayaran.'); return }
    if (!paymentMethod) { setError('Pilih metode pembayaran terlebih dahulu.'); return }
    if (paymentMethod !== 'cash' && !proof && !createdOrder) { setError('Unggah bukti pembayaran untuk melanjutkan.'); return }
    if (!buyerName.trim()) { setError('Nama lengkap wajib diisi.'); return }
    setSaving(true)
    try {
      let order = createdOrder
      if (!order) {
        const { error: profileError } = await supabase.from('profiles').upsert({ id: userId, full_name: buyerName.trim() }, { onConflict: 'id' })
        if (profileError) throw profileError
        const { data, error: orderError } = await supabase.rpc('create_buyer_order', {
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
      if (paymentMethod !== 'cash' && proof) await uploadProof(order, proof)
      setPage('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pembayaran belum berhasil dikirim. Coba lagi.')
    } finally { setSaving(false) }
  }

  const startCheckout = () => {
    setPaymentMethod(null)
    setProof(null)
    setCreatedOrder(null)
    setError('')
    setPage('checkout')
  }

  return <main className="storefront">
    <header className="storefront-nav">
      <button className="storefront-logo" onClick={() => setPage('home')} aria-label="Kembali ke beranda">
        <img src="/assets/pesanaja-logo.svg" alt="PesanAja" />
      </button>
      <nav><button className={page.startsWith('education') ? 'selected' : ''} onClick={() => setPage('education')}>Edukasi</button><button className={page === 'home' || page === 'detail' || page === 'store' ? 'selected' : ''} onClick={() => setPage('home')}>Belanja</button></nav>
      <div className="storefront-actions">
        <button className="storefront-cart-link" aria-label={`Keranjang, ${cartCount} produk`} onClick={() => setPage('cart')}><ShoppingCart size={21}/>{cartCount > 0 && <span>{cartCount}</span>}</button>
        <span className="storefront-buyer-name">{buyerName || 'Pembeli'}</span>
        <button className="storefront-signout" aria-label="Keluar" onClick={() => void signOut()}><LogOut size={17}/></button>
      </div>
    </header>

    {page === 'education' && <section className="storefront-page buyer-education-page">
      <div className="buyer-education-heading"><div><span className="buyer-education-eyebrow">PANDUAN PEMBELI</span><h1>Edukasi</h1><p>Tips sederhana untuk belanja pre-order dengan nyaman dan aman.</p></div><BookOpen size={30} aria-hidden="true"/></div>
      <div className="buyer-education-grid">
        {[0, 1, 2, 3, 4, 5].map(index => <article className="buyer-education-card" key={index}>
          <img src="/assets/education/buyer-guide.png" alt="Pembeli sedang memeriksa informasi produk sebelum berbelanja" />
          <div className="buyer-education-card-body"><span className="buyer-education-tag"><UserRound size={14}/> Pembeli</span><h2>{buyerGuide.title}</h2><p>{buyerGuide.intro}</p><button className="store-pill-button" onClick={() => setPage('education-detail')}>Baca <ArrowRight size={16}/></button></div>
        </article>)}
      </div>
      <footer className="storefront-footer"><img src="/assets/pesanaja-logo-concept.svg" alt="PesanAja"/><small>© 2026 PesanAja Indonesia</small></footer>
    </section>}

    {page === 'education-detail' && <article className="storefront-page buyer-education-detail">
      <button className="storefront-back" onClick={() => setPage('education')}><ArrowLeft size={18}/> Kembali ke edukasi</button>
      <div className="buyer-article-hero"><img src={buyerGuide.image} alt="Ilustrasi pembeli meninjau produk secara cermat"/><div><span className="buyer-education-tag"><UserRound size={14}/> Pembeli</span><h1>{buyerGuide.title}</h1><p>{buyerGuide.intro}</p><p>Yuk, jadi pembeli yang lebih bijak!</p></div></div>
      <section className="buyer-article-section"><h2>01. Read Before You Buy</h2><p>Jangan terburu-buru melakukan pemesanan hanya karena produknya terlihat menarik. Sebelum membeli, pastikan kamu sudah membaca:</p><ul><li>Deskripsi dan spesifikasi produk.</li><li>Harga dan biaya tambahan jika ada.</li><li>Varian atau pilihan produk.</li><li>Jadwal pemesanan dan pengiriman.</li><li>Ketentuan pembatalan pesanan.</li></ul><p>Dengan membaca informasi produk terlebih dahulu, kamu bisa menghindari kesalahpahaman setelah melakukan transaksi.</p></section>
      <footer className="storefront-footer"><img src="/assets/pesanaja-logo-concept.svg" alt="PesanAja"/><small>© 2026 PesanAja Indonesia</small></footer>
    </article>}

    {page === 'home' && <section className="storefront-home">
      <div className="storefront-welcome"><p>Pre-Order kampus lebih mudah bersama PesanAja</p><h1>Selamat Pagi!</h1><h2>Lagi pengen jajan apa?</h2>
        <label className="storefront-search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari produk atau toko"/><span>Cari</span></label>
        <button className="storefront-refresh" onClick={() => void loadStore()} disabled={loading} aria-label="Muat ulang produk"><RefreshCw size={16}/> Muat ulang</button>
      </div>
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
      </div> : <div className="storefront-empty"><div>🧺</div><h2>{search ? 'Produk tidak ditemukan' : 'Belum ada pre-order aktif'}</h2><p>{search ? 'Coba kata kunci lain.' : 'Produk dari toko kampus akan muncul di sini saat batch pre-order dibuka.'}</p></div>}
      <footer className="storefront-footer"><img src="/assets/pesanaja-logo-concept.svg" alt="PesanAja"/><small>© 2026 PesanAja Indonesia</small></footer>
    </section>}

    {page === 'detail' && selected && <section className="storefront-page storefront-detail">
      <button className="storefront-back" onClick={() => setPage('home')}><ArrowLeft size={18}/> Kembali</button>
      <div className="detail-layout"><ProductImage product={selected} large/>
        <div className="detail-info"><h1>{selected.name}</h1>
          <p className="detail-deadline"><Clock3 size={17}/>{selected.closesAt ? `Tutup ${new Date(selected.closesAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}` : 'Pre-order sedang dibuka'}</p>
          <strong className="detail-price">{money(selected.price)}</strong>
          <div className="detail-seller"><button className="detail-store" onClick={() => void openStoreProfile(selected.storeId)} aria-label={`Lihat profil toko ${selected.storeName}`}><span className="detail-store-mark">{selected.storeName.slice(0, 1).toUpperCase()}</span><b>{selected.storeName}</b></button></div>
          {selected.variants.length > 0 && <label className="detail-variant-select">Pilih varian<select value={selectedVariant} onChange={event => setSelectedVariant(event.target.value)}><option value="">Pilih varian</option>{selected.variants.map(variant => <option key={variant} value={variant}>{variant}</option>)}</select></label>}
          <div className="detail-buy-row"><div className="quantity-control"><button aria-label="Kurangi jumlah" onClick={() => setDetailQuantity(value => Math.max(1, value - 1))}><Minus size={14}/></button><b>{detailQuantity}</b><button aria-label="Tambah jumlah" onClick={() => setDetailQuantity(value => Math.min(selected.stockLimit ?? 99, value + 1))}><Plus size={14}/></button></div><button className="store-pill-button" onClick={() => addToCart(selected, detailQuantity, selected.variants.length ? selectedVariant || null : null)}>Masukkan keranjang</button></div>
        </div>
      </div>
      <section className="detail-description"><h2>Deskripsi</h2><p>{selected.description}</p><p><b>Batch:</b> {selected.batchName}</p>{selected.pickupLocation && <p><b>Lokasi pengambilan:</b> {selected.pickupLocation}</p>}</section>
      {error && <p className="storefront-error" role="alert">{error}</p>}
    </section>}

    {page === 'store' && <section className="storefront-page storefront-store-profile">
      <button className="storefront-back" onClick={() => setPage(selected ? 'detail' : 'home')}><ArrowLeft size={18}/> Kembali</button>
      {storeProfileLoading ? <div className="storefront-empty">Memuat profil toko…</div> : storeProfile ? <>
        <header className="store-profile-heading"><span className="detail-store-mark">{storeProfile.store_name.slice(0, 1).toUpperCase()}</span><div><span>PROFIL PENJUAL</span><h1>{storeProfile.store_name}</h1></div></header>
        <div className="store-profile-details">{storeProfile.description && <p>{storeProfile.description}</p>}{storeProfile.pickup_location && <p><b>Lokasi pengambilan:</b> {storeProfile.pickup_location}</p>}</div>
        <h2 className="store-profile-products-title">Produk toko</h2>
        {products.filter(product => product.storeId === storeProfile.user_id).length ? <div className="storefront-grid">{products.filter(product => product.storeId === storeProfile.user_id).map(product => <article className="store-product-card" key={`${product.batchId}-${product.id}`}><button className="store-product-open" onClick={() => openProduct(product)}><ProductImage product={product}/><div className="store-product-title"><strong>{product.name}</strong><span><Store size={13}/>{product.category}</span></div><small className="store-product-batch">{product.batchName}</small><b className="store-product-price">{money(product.price)}<small> /pcs</small></b></button><button className="store-pill-button" onClick={() => openProduct(product)}>Lihat produk</button></article>)}</div> : <div className="storefront-empty">Belum ada produk aktif di batch terbuka.</div>}
      </> : error && <p className="storefront-error" role="alert">{error}</p>}
    </section>}

    {page === 'cart' && <section className="storefront-page storefront-cart-page">
      <h1>Keranjang ({cartCount})</h1>
      {cart.length ? <>
        <div className="cart-store-name"><span>{cart[0].product.storeName.slice(0, 1).toUpperCase()}</span><b>{cart[0].product.storeName}</b></div>
        {cart.map(line => <article className="cart-line" key={line.product.id}>
          <ProductImage product={line.product}/>
          <div className="cart-line-info"><button onClick={() => openProduct(line.product)}>{line.product.name}</button>{line.variant && <p>Varian: {line.variant}</p>}<p>Batch: {line.product.batchName}</p><strong>{money(line.product.price * line.quantity)}</strong></div>
          <div className="quantity-control"><button aria-label="Kurangi jumlah" onClick={() => changeQuantity(line.product, -1)}><Minus size={14}/></button><b>{line.quantity}</b><button aria-label="Tambah jumlah" onClick={() => changeQuantity(line.product, 1)}><Plus size={14}/></button></div>
          <button className="cart-remove" aria-label={`Hapus ${line.product.name}`} onClick={() => setCart(current => current.filter(item => item.product.id !== line.product.id))}><Trash2 size={18}/></button>
        </article>)}
        <div className="cart-checkout-bar"><div><strong>{money(cartTotal)}</strong><span>{cartCount} produk</span></div><button className="store-pill-button" onClick={startCheckout}>Beli sekarang <ArrowRight size={17}/></button></div>
      </> : <div className="storefront-empty"><div>🛒</div><h2>Keranjang masih kosong</h2><p>Pilih produk yang kamu suka dan tambahkan ke keranjang.</p><button className="store-pill-button" onClick={() => setPage('home')}>Mulai belanja</button></div>}
    </section>}

    {page === 'checkout' && <section className="storefront-page checkout-page">
      <h1>Pembayaran</h1><form onSubmit={submitPayment}>
        <div className="checkout-columns"><div className="checkout-fields">
          <label className="checkout-label">Nama Lengkap<div className="checkout-input"><UserRound size={18}/><input value={buyerName} onChange={event => setBuyerName(event.target.value)} placeholder="Nama Lengkap" required disabled={Boolean(createdOrder)}/></div></label>
          <fieldset className="payment-methods"><legend>Pilih Metode Pembayaran</legend>
            {([
              ['qris', 'QRIS', 'Ikuti petunjuk QRIS dari penjual dan unggah bukti pembayaran.'],
              ['transfer', 'Transfer ke penjual', 'Transfer ke rekening/e-wallet penjual dan unggah bukti pembayaran.'],
              ['cash', 'Tunai', 'Bayar tunai kepada penjual saat mengambil pesanan.'],
            ] as const).map(([method, label, instruction]) => <div className={`payment-option ${paymentMethod === method ? 'expanded' : ''}`} key={method}>
              <label><input type="radio" name="payment-method" checked={paymentMethod === method} disabled={Boolean(createdOrder)} onChange={() => { setPaymentMethod(method); setError('') }}/><span>{label}</span></label>
              {paymentMethod === method && <div className="payment-instructions"><p>{instruction}</p>{method === 'qris' && <p className="seller-payment-details">Penjual belum memiliki QRIS.</p>}{method === 'transfer' && <p className="seller-payment-details">{cart[0]?.product.paymentDetails || 'Penjual belum mengisi informasi pembayaran. Hubungi penjual sebelum membayar.'}</p>}</div>}
            </div>)}
          </fieldset>
          {paymentMethod && paymentMethod !== 'cash' && (
            <div className="checkout-label">
              <span>Bukti Pembayaran</span>
              <label className={`proof-upload ${proof ? 'has-file' : ''}`}>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                  disabled={Boolean(createdOrder)}
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null
                    if (file && file.size > 5 * 1024 * 1024) {
                      setProof(null)
                      setError('Ukuran bukti pembayaran maksimal 5 MB.')
                      return
                    }
                    setProof(file)
                    setError('')
                  }}
                />
                {proof ? <><Check size={21}/><span>{proof.name}</span></> : <><ImagePlus size={22}/><span>Unggah bukti pembayaran<br/><small>.png .jpg .pdf (maks. 5 MB)</small></span></>}
              </label>
            </div>
          )}
          {error && <p className="storefront-error" role="alert">{error}</p>}
        </div><aside className="checkout-summary"><h2>Informasi Produk</h2>{cart.map(line => <div className="checkout-product" key={line.product.id}><ProductImage product={line.product}/><div><b>{line.product.name}</b><span>{line.product.category}</span>{line.variant && <span>Varian: {line.variant}</span>}<span>Qty: {line.quantity}</span><strong>{money(line.product.price * line.quantity)}</strong></div></div>)}<h2>Ringkasan Pesanan</h2><div className="summary-row"><span>Subtotal</span><span>{money(cartTotal)}</span></div><div className="summary-row"><span>Biaya Layanan</span><span>{money(0)}</span></div><div className="summary-total"><span>Total</span><strong>{money(cartTotal)}</strong></div></aside></div>
        <button className="store-pill-button checkout-submit" type="submit" disabled={saving}>{saving ? 'Memproses…' : createdOrder ? 'Coba unggah bukti lagi' : 'Konfirmasi'}</button>
      </form>
    </section>}

    {page === 'done' && createdOrder && <section className="storefront-success"><div className="payment-success-icon"><Check size={34}/></div><h1>{paymentMethod === 'cash' ? 'Pesanan terkirim ke penjual' : 'Pembayaran terkirim ke penjual'}</h1><p>Pesanan <b>{createdOrder.orderNumber}</b> sudah masuk ke penjual{paymentMethod === 'cash' ? ' dan menunggu konfirmasi setelah pembayaran tunai diterima.' : ' dan menunggu konfirmasi setelah pembayaran diperiksa.'}</p><div className="success-order-total"><span>Total pesanan</span><b>{money(createdOrder.total)}</b></div><button className="store-pill-button" onClick={() => { setCart([]); setCreatedOrder(null); setProof(null); setPaymentMethod(null); setPage('home') }}>Kembali ke beranda</button></section>}
  </main>
}

function ProductImage({ product, large = false }: { product: Product; large?: boolean }) {
  return <div className={`store-product-image ${large ? 'large' : ''}`}>
    {product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span aria-hidden="true">{product.category.toLowerCase().includes('minum') ? '🧋' : product.category.toLowerCase().includes('kue') || product.category.toLowerCase().includes('dessert') ? '🍪' : '🍱'}</span>}
  </div>
}
