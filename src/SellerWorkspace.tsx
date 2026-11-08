import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BookOpen, ChevronDown, CircleHelp, Clock3, Ellipsis, Eye, Pencil,
  LayoutDashboard, LogOut, Package, Plus, Search, Settings, ShieldCheck,
  ShoppingBag, ShoppingCart, Sparkles, Wallet, X,
} from 'lucide-react'
import SellerOrders from './SellerOrders'
import { supabase } from './lib/supabase'

type Product = {
  id: string
  name: string
  category: string | null
  variants: string[]
  description: string | null
  image_url: string | null
  price: number
  cost_price: number
  stock: number | null
  is_active: boolean
}
type Batch = { id: string; name: string; status: string; closes_at: string | null }
type BatchProduct = { batch_id: string; product_id: string; price: number; stock_limit: number | null }
type OrderItem = { product_id: string; product_name: string; variant: string | null; quantity: number; line_total: number }
type Order = {
  id: string
  batch_id: string
  order_number: string
  status: string
  subtotal: number
  total: number
  created_at: string
  buyer: { full_name: string | null } | null
  order_items: OrderItem[]
}
type Payment = { id: string; method: string | null; status: string; amount: number; created_at: string; order: { order_number: string } | null }
type ProductForm = { name: string; category: string; description: string; price: string; cost: string; stock: string }

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const productCategories = ['Makanan Berat & Bento', 'Kue dan Roti', 'Minuman', 'Lainnya']
const statusName = (status: string) => ({
  paid: 'Dibayar', completed: 'Selesai', unpaid: 'Belum bayar', ordered: 'Menunggu pembayaran',
  installment: 'Dicicil', cancelled: 'Dibatalkan',
}[status] ?? status)
const methodName = (method: string | null) => ({ qris: 'QRIS', transfer: 'Transfer', cash: 'Tunai' }[method ?? ''] ?? 'Belum dipilih')

export default function SellerWorkspace({ userId, storeName, onSignOut }: { userId: string; storeName: string; onSignOut: () => void }) {
  const [active, setActive] = useState('Ringkasan')
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchProducts, setBatchProducts] = useState<BatchProduct[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [viewProduct, setViewProduct] = useState<Product | null>(null)
  const [viewBatch, setViewBatch] = useState<Batch | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [productForm, setProductForm] = useState<ProductForm>({ name: '', category: '', description: '', price: '', cost: '', stock: '' })
  const [productVariants, setProductVariants] = useState<string[]>([])
  const [productImage, setProductImage] = useState<File | null>(null)
  const [batchName, setBatchName] = useState('')
  const [batchClosesAt, setBatchClosesAt] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [productImagePreview, setProductImagePreview] = useState('')

  useEffect(() => {
    if (!productImage) {
      setProductImagePreview('')
      return
    }
    const previewUrl = URL.createObjectURL(productImage)
    setProductImagePreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [productImage])

  const loadData = useCallback(async () => {
    if (!supabase || !userId) {
      setError('Sesi penjual tidak tersedia. Silakan masuk kembali.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [productsResult, batchesResult, batchProductsResult, ordersResult, paymentsResult, sellerResult] = await Promise.all([
      supabase.from('products').select('id,name,category,variants,description,image_url,price,cost_price,stock,is_active').eq('store_id', userId).order('created_at', { ascending: false }),
      supabase.from('preorder_batches').select('id,name,status,closes_at').eq('store_id', userId).order('created_at', { ascending: false }),
      supabase.from('batch_products').select('batch_id,product_id,price,stock_limit,batch:preorder_batches!inner(store_id)').eq('batch.store_id', userId),
      supabase.from('orders').select('id,batch_id,order_number,status,subtotal,total,created_at,buyer:profiles!orders_buyer_id_fkey(full_name),order_items(product_id,product_name,variant,quantity,line_total)').eq('store_id', userId).order('created_at', { ascending: false }),
      supabase.from('payments').select('id,method,status,amount,created_at,order:orders!inner(order_number,store_id)').eq('order.store_id', userId).order('created_at', { ascending: false }),
      supabase.from('seller_profiles').select('verification_status').eq('user_id', userId).maybeSingle(),
    ])
    const errors = [productsResult.error, batchesResult.error, batchProductsResult.error, ordersResult.error, paymentsResult.error, sellerResult.error].filter(Boolean)
    if (productsResult.error) setProducts([])
    else setProducts((productsResult.data ?? []) as Product[])
    if (batchesResult.error) setBatches([])
    else setBatches((batchesResult.data ?? []) as Batch[])
    if (batchProductsResult.error) setBatchProducts([])
    else setBatchProducts((batchProductsResult.data ?? []) as BatchProduct[])
    if (ordersResult.error) setOrders([])
    else setOrders((ordersResult.data ?? []) as unknown as Order[])
    if (paymentsResult.error) setPayments([])
    else setPayments((paymentsResult.data ?? []) as unknown as Payment[])
    if (sellerResult.error) setVerificationStatus(null)
    else setVerificationStatus(sellerResult.data?.verification_status ?? null)
    if (errors.length) setError(`Sebagian data dashboard gagal dimuat: ${errors.map(item => item?.message).join(' · ')}`)
    setLoading(false)
  }, [userId])

  useEffect(() => { void loadData() }, [loadData])

  const soldByProduct = useMemo(() => {
    const totals = new Map<string, number>()
    for (const order of orders) {
      if (!['paid', 'completed'].includes(order.status)) continue
      for (const item of order.order_items ?? []) totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.quantity)
    }
    return totals
  }, [orders])
  const bestProducts = useMemo(() => [...products]
    .filter(product => (soldByProduct.get(product.id) ?? 0) > 0)
    .sort((a, b) => (soldByProduct.get(b.id) ?? 0) - (soldByProduct.get(a.id) ?? 0))
    .slice(0, 3), [products, soldByProduct])
  const activeBatches = batches.filter(batch => batch.status === 'open' && (!batch.closes_at || new Date(batch.closes_at) > new Date()))
  const paidOrders = orders.filter(order => order.status === 'paid' || order.status === 'completed')
  const revenue = paidOrders.reduce((sum, order) => sum + order.total, 0)
  const outstandingOrders = orders.filter(order => ['ordered', 'unpaid', 'installment'].includes(order.status)).length
  const soldCount = paidOrders.reduce((sum, order) => sum + order.order_items.reduce((sub, item) => sub + item.quantity, 0), 0)
  const visibleProducts = products.filter(product => `${product.name} ${product.category ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const latestBatch = activeBatches[0]
  const batchProductCount = latestBatch ? batchProducts.filter(item => item.batch_id === latestBatch.id).length : 0
  const dailyRevenue = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    return {
      date,
      total: paidOrders.filter(order => {
        const created = new Date(order.created_at)
        return created >= date && created < nextDay
      }).reduce((sum, order) => sum + order.total, 0),
    }
  })
  const maxDailyRevenue = Math.max(1, ...dailyRevenue.map(day => day.total))
  const notify = (value: string) => { setNotice(value); window.setTimeout(() => setNotice(''), 3000) }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError('')
    const variants = [...new Set(productVariants.map(variant => variant.trim()).filter(Boolean))]
    const productId = editingProduct?.id ?? crypto.randomUUID()
    let imagePath: string | null = null
    let imageUrl: string | null = null
    if (productImage) {
      const extension = productImage.type === 'image/png' ? 'png' : productImage.type === 'image/webp' ? 'webp' : 'jpg'
      imagePath = `${userId}/${productId}-${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('product-images').upload(imagePath, productImage, {
        contentType: productImage.type,
        upsert: false,
      })
      if (uploadError) {
        const bucketMissing = uploadError.message.toLowerCase().includes('bucket not found')
        setError(bucketMissing
          ? 'Bucket foto belum tersedia di project Supabase ini. Terapkan migration 20261108170000_product_image_uploads.sql di Supabase yang sama dengan aplikasi, lalu coba lagi.'
          : `Foto produk gagal diunggah: ${uploadError.message}`)
        setSaving(false)
        return
      }
      imageUrl = supabase.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl
    }
    const productValues = {
      store_id: userId,
      name: productForm.name.trim(),
      category: productForm.category || null,
      variants,
      description: productForm.description.trim() || null,
      price: Number(productForm.price),
      cost_price: Number(productForm.cost || 0),
      stock: productForm.stock === '' ? null : Number(productForm.stock),
      is_active: true,
    }
    const saveResult = editingProduct
      ? await supabase.from('products').update({ ...productValues, is_active: editingProduct.is_active, ...(imageUrl ? { image_url: imageUrl } : {}) }).eq('id', editingProduct.id).eq('store_id', userId)
      : await supabase.from('products').insert({ id: productId, ...productValues, image_url: imageUrl })
    const saveError = saveResult.error
    if (saveError) {
      if (imagePath) {
        const { error: cleanupError } = await supabase.storage.from('product-images').remove([imagePath])
        setError(cleanupError
          ? `Produk gagal disimpan: ${saveError.message}. Foto juga gagal dibersihkan: ${cleanupError.message}`
          : `Produk gagal disimpan: ${saveError.message}`)
      } else setError(`Produk gagal disimpan: ${saveError.message}`)
    } else {
      setProductForm({ name: '', category: '', description: '', price: '', cost: '', stock: '' })
      setProductVariants([])
      setProductImage(null)
      setShowProductForm(false)
      setEditingProduct(null)
      notify(editingProduct ? 'Produk berhasil diperbarui.' : 'Produk berhasil ditambahkan.')
      await loadData()
    }
    setSaving(false)
  }

  async function saveBatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError('')
    const { error: saveError } = editingBatch
      ? await supabase.rpc('update_seller_batch', {
        p_batch_id: editingBatch.id,
        p_name: batchName.trim(),
        p_closes_at: new Date(batchClosesAt).toISOString(),
        p_product_ids: selectedProductIds,
      })
      : await supabase.rpc('create_seller_batch', {
        p_name: batchName.trim(),
        p_closes_at: new Date(batchClosesAt).toISOString(),
        p_product_ids: selectedProductIds,
      })
    if (saveError) setError(`Batch gagal dibuat: ${saveError.message}`)
    else {
      setBatchName('')
      setBatchClosesAt('')
      setSelectedProductIds([])
      setShowBatchForm(false)
      setEditingBatch(null)
      notify(editingBatch ? 'Batch berhasil diperbarui.' : 'Batch pre-order berhasil dibuat dan dibuka.')
      await loadData()
    }
    setSaving(false)
  }

  async function toggleProduct(product: Product) {
    if (!supabase) return
    const { error: updateError } = await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id).eq('store_id', userId)
    if (updateError) setError(`Status produk gagal diperbarui: ${updateError.message}`)
    else await loadData()
  }

  function closeProductForm() {
    setShowProductForm(false)
    setEditingProduct(null)
    setProductImage(null)
    setProductForm({ name: '', category: '', description: '', price: '', cost: '', stock: '' })
    setProductVariants([])
    setError('')
  }

  function openProductForm(product?: Product) {
    setEditingProduct(product ?? null)
    setProductForm(product ? {
      name: product.name,
      category: product.category ?? '',
      description: product.description ?? '',
      price: String(product.price),
      cost: String(product.cost_price),
      stock: product.stock === null ? '' : String(product.stock),
    } : { name: '', category: '', description: '', price: '', cost: '', stock: '' })
    setProductVariants(product?.variants ?? [])
    setProductImage(null)
    setError('')
    setShowProductForm(true)
  }

  function openBatchForm(batch?: Batch) {
    setEditingBatch(batch ?? null)
    setBatchName(batch?.name ?? '')
    setBatchClosesAt(batch?.closes_at ? new Date(new Date(batch.closes_at).getTime() - new Date(batch.closes_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
    setSelectedProductIds(batch ? batchProducts.filter(item => item.batch_id === batch.id && products.some(product => product.id === item.product_id && product.is_active)).map(item => item.product_id) : [])
    setError('')
    setShowBatchForm(true)
  }

  function viewBatchProducts(batch: Batch) {
    setViewBatch(batch)
  }

  function closeBatchForm() {
    setShowBatchForm(false)
    setEditingBatch(null)
    setBatchName('')
    setBatchClosesAt('')
    setSelectedProductIds([])
    setError('')
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={() => setActive('Ringkasan')}><picture className="brand-art"><source media="(max-width: 850px)" srcSet="/assets/pesanaja-icon.svg"/><img src="/assets/pesanaja-logo.svg" alt="PesanAja"/></picture></a>
      <button className="workspace-switch" onClick={() => setShowProfile(value => !value)}><span className="shop-avatar">{storeName.slice(0, 1).toUpperCase()}</span><span className="workspace-text"><b>{storeName}</b><small>Dashboard Penjual</small></span><ChevronDown size={15} className="muted"/></button>
      <div className="menu-label">WORKSPACE</div>
      <nav className="main-nav">
        <NavItem icon={<LayoutDashboard/>} label="Ringkasan" active={active} onClick={setActive}/>
        <NavItem icon={<ShoppingCart/>} label="Pesanan" badge={orders.length ? String(orders.length) : undefined} active={active} onClick={setActive}/>
        <NavItem icon={<Package/>} label="Produk" active={active} onClick={setActive}/>
        <NavItem icon={<Clock3/>} label="Batch pre-order" active={active} onClick={setActive}/>
        <NavItem icon={<Wallet/>} label="Keuangan" active={active} onClick={setActive}/>
      </nav>
      <div className="menu-label second-label">LAINNYA</div>
      <nav className="main-nav"><NavItem icon={<BookOpen/>} label="Belajar jualan" active={active} onClick={setActive}/><NavItem icon={<CircleHelp/>} label="Pusat bantuan" active={active} onClick={setActive}/></nav>
      <div className="sidebar-bottom">
        <div className="seller-tip"><div className="tip-icon"><Sparkles size={16}/></div><b>Jualan makin rapi</b><p>Kelola produk, batch, dan pesanan dari satu tempat.</p><button onClick={() => setActive('Produk')}>Kelola produk <ArrowRight size={14}/></button><span className="tip-orb"/></div>
        <button className="nav-item setting-item" onClick={() => notify('Pengaturan akan segera tersedia')}><Settings size={18}/><span>Pengaturan</span></button>
        <button className="profile-row" onClick={() => setShowProfile(value => !value)}><span className="profile-pic">{storeName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><b>{storeName}</b><small>Profil toko <ShieldCheck size={12}/></small></span><Ellipsis size={18} className="muted"/></button>
      </div>
      {showProfile && <div className="profile-popover"><b>{storeName}</b><span>Seller workspace</span><button className="profile-signout" onClick={onSignOut}><LogOut size={14}/> Keluar</button></div>}
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{active}</strong></div><div className="top-actions"><button className="icon-button help-button" aria-label="Pusat bantuan" onClick={() => notify('Pusat bantuan siap membantu')}><CircleHelp size={18}/></button><span className="top-divider"/><button className="seller-chip" onClick={() => setShowProfile(value => !value)}><span className="online-dot"/>Mode penjual<ChevronDown size={14}/></button></div></header>
      {error && !showProductForm && !showBatchForm && <p className="workspace-message error" role="alert">{error}</p>}
      {notice && <p className="workspace-message success" role="status">{notice}</p>}
      {active === 'Pesanan' ? <SellerOrders storeId={userId}/> : active === 'Produk' ? <section className="workspace-page">
        <PageHeading eyebrow="KATALOG TOKO" title="Produk" description="Kelola produk yang tersedia di tokomu." action={<button className="primary-button" onClick={() => openProductForm()}><Plus size={17}/> Tambah produk</button>}/>
        <label className="workspace-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari produk"/></label>
        {loading ? <EmptyState text="Memuat produk…"/> : visibleProducts.length ? <div className="workspace-product-list">{visibleProducts.map(product => <ProductRow key={product.id} product={product} sold={soldByProduct.get(product.id) ?? 0} onToggle={() => void toggleProduct(product)} onView={() => setViewProduct(product)} onEdit={() => openProductForm(product)}/>)}</div> : <EmptyState text={search ? 'Produk tidak ditemukan.' : 'Belum ada produk. Tambahkan produk pertamamu untuk mulai berjualan.'}/>}
      </section> : active === 'Batch pre-order' ? <section className="workspace-page">
        <PageHeading eyebrow="JADWAL PENJUALAN" title="Batch pre-order" description="Buka batch dan pilih produk yang ingin dijual." action={<button className="primary-button" onClick={() => openBatchForm()} disabled={!products.some(product => product.is_active)}><Plus size={17}/> Buat batch</button>}/>
        {loading ? <EmptyState text="Memuat batch…"/> : batches.length ? <div className="workspace-batch-list">{batches.map(batch => <article className="workspace-batch-card" key={batch.id}><div><span className={`workspace-batch-status ${batch.status}`}>{batch.status === 'open' ? 'Dibuka' : batch.status === 'draft' ? 'Draft' : batch.status}</span><h2>{batch.name}</h2><p>{batchProducts.filter(item => item.batch_id === batch.id).length} produk · {batch.closes_at ? `Tutup ${new Date(batch.closes_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Tanpa batas waktu'}</p></div><span>{orders.filter(order => order.batch_id === batch.id).length} pesanan</span><div className="workspace-row-actions"><button className="secondary-button" onClick={() => void viewBatchProducts(batch)}><Eye size={15}/> Lihat</button>{['open', 'draft'].includes(batch.status) && <button className="secondary-button" onClick={() => openBatchForm(batch)}><Pencil size={15}/> Edit</button>}</div></article>)}</div> : <EmptyState text="Belum ada batch. Buat batch untuk menampilkan produk di halaman belanja."/>}
      </section> : active === 'Keuangan' ? <section className="workspace-page">
        <PageHeading eyebrow="RINGKASAN TRANSAKSI" title="Keuangan" description="Pantau pembayaran pesanan di tokomu."/>
        <div className="finance-total"><span>Total pembayaran terkonfirmasi</span><strong>{money(revenue)}</strong><small>{paidOrders.length} pesanan dibayar</small></div>
        {loading ? <EmptyState text="Memuat transaksi…"/> : payments.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Pesanan</th><th>Tanggal</th><th>Metode</th><th>Jumlah</th><th>Status</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td>{payment.order?.order_number ?? 'Pesanan'}</td><td>{new Date(payment.created_at).toLocaleDateString('id-ID')}</td><td>{methodName(payment.method)}</td><td>{money(payment.amount)}</td><td><span className={`seller-order-status ${payment.status === 'paid' ? 'paid' : ''}`}>{statusName(payment.status)}</span></td></tr>)}</tbody></table></div> : <EmptyState text="Belum ada transaksi. Pembayaran akan muncul setelah pembeli memesan."/>}
      </section> : active === 'Belajar jualan' || active === 'Pusat bantuan' ? <section className="workspace-page"><PageHeading eyebrow="PESANAJA" title={active} description="Panduan dan bantuan akan tersedia di sini."/><EmptyState text="Belum ada konten untuk ditampilkan."/></section> : <section className="workspace-page">
        <div className="workspace-welcome"><div><div className="eyebrow"><span className="eyebrow-dot"/> {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div><h1>Selamat pagi, {storeName}</h1><p>Ringkasan berdasarkan data toko yang sudah kamu masukkan.</p></div><button className="primary-button" onClick={() => openBatchForm()} disabled={!products.some(product => product.is_active)}><Plus size={17}/> Buat batch baru</button></div>
        {verificationStatus && verificationStatus !== 'verified' && <div className="workspace-callout"><ShieldCheck size={22}/><div><b>Email penjual belum terkonfirmasi</b><span>Konfirmasi email @student.ub.ac.id yang dipakai untuk mendaftar. Setelah email terkonfirmasi dan NIM tersimpan, toko otomatis aktif. Produk juga harus aktif dan dimasukkan ke batch pre-order yang sedang dibuka agar terlihat oleh pembeli.</span></div></div>}
        {loading ? <EmptyState text="Memuat ringkasan toko…"/> : <>
          {!products.length && <div className="workspace-callout"><Package size={22}/><div><b>Toko belum memiliki produk</b><span>Tambahkan produk untuk mulai membuat batch pre-order.</span></div><button className="primary-button" onClick={() => { setActive('Produk'); openProductForm() }}><Plus size={15}/> Tambah produk</button></div>}
          {latestBatch && <section className="workspace-batch-banner"><div><span>BATCH SEDANG DIBUKA</span><h2>{latestBatch.name}</h2><p>{latestBatch.closes_at ? `Tutup ${new Date(latestBatch.closes_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Belum ada batas waktu tutup'}</p></div><div><b>{orders.filter(order => order.status !== 'cancelled').length}</b><span>pesanan masuk</span><b>{batchProductCount}</b><span>produk tersedia</span></div><button onClick={() => setActive('Batch pre-order')}>Lihat batch <ArrowRight size={15}/></button></section>}
          <section className="workspace-stats">
            <DataStat icon={<Wallet size={19}/>} title="Total penjualan" value={money(revenue)} foot={`${paidOrders.length} pesanan dibayar`}/>
            <DataStat icon={<ShoppingBag size={19}/>} title="Pesanan masuk" value={String(orders.length)} foot="semua pesanan toko"/>
            <DataStat icon={<Clock3 size={19}/>} title="Perlu diproses" value={String(outstandingOrders)} foot="menunggu pembayaran"/>
            <DataStat icon={<Package size={19}/>} title="Produk terjual" value={String(soldCount)} foot={`${products.filter(product => product.is_active).length} produk aktif`}/>
          </section>
          <section className="workspace-insights">
            <div className="panel workspace-chart"><div className="panel-heading"><div><h3>Penjualan 7 hari terakhir</h3><p>Hanya pembayaran yang sudah dikonfirmasi</p></div><strong>{money(dailyRevenue.reduce((sum, day) => sum + day.total, 0))}</strong></div><div className="workspace-bars">{dailyRevenue.map(day => <div key={day.date.toISOString()} title={`${day.date.toLocaleDateString('id-ID')}: ${money(day.total)}`}><span style={{ height: `${Math.max(4, day.total / maxDailyRevenue * 100)}%` }}/><small>{new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(day.date)}</small></div>)}</div></div>
            <div className="panel workspace-best"><div className="panel-heading"><div><h3>Produk terlaris</h3><p>Diurutkan dari pesanan toko</p></div><button className="more-button" onClick={() => setActive('Produk')} aria-label="Lihat produk"><Ellipsis size={20}/></button></div>
              {bestProducts.length > 0 && <div className="workspace-best-list">{bestProducts.map(product => <div className="workspace-best-row" key={product.id}><ProductThumb product={product}/><div><b>{product.name}</b><span>{product.category || 'Produk'} · {soldByProduct.get(product.id) ?? 0} terjual</span></div><strong>{money(product.price)}</strong></div>)}</div>}
              <button className="text-link" onClick={() => setActive('Produk')}>Lihat semua produk <ArrowRight size={14}/></button>
            </div>
          </section>
          <section className="panel workspace-recent"><div className="panel-heading"><div><h3>Pesanan terbaru</h3><p>Pesanan dari pembeli</p></div><button className="text-link" onClick={() => setActive('Pesanan')}>Lihat semua <ArrowRight size={14}/></button></div>
            {orders.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>ID Pesanan</th><th>Pembeli</th><th>Produk</th><th>Total</th><th>Status</th></tr></thead><tbody>{orders.slice(0, 5).map(order => <tr key={order.id}><td>{order.order_number}</td><td>{order.buyer?.full_name || 'Pembeli'}</td><td>{order.order_items.map(item => `${item.product_name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity}`).join(', ') || '—'}</td><td>{money(order.total)}</td><td><span className={`seller-order-status ${['paid', 'completed'].includes(order.status) ? 'paid' : ''}`}>{statusName(order.status)}</span></td></tr>)}</tbody></table></div> : <EmptyState text="Pesanan pembeli akan muncul di sini."/>}
          </section>
        </>}
      </section>}
    </main>

    {showProductForm && <div className="modal-backdrop" onClick={closeProductForm}><form className="workspace-modal" onClick={event => event.stopPropagation()} onSubmit={saveProduct}><div className="workspace-modal-heading"><div><span>PRODUK TOKO</span><h2>{editingProduct ? 'Edit produk' : 'Tambah produk'}</h2></div><button type="button" className="icon-button" onClick={closeProductForm} aria-label="Tutup"><X size={18}/></button></div>
      {error && <p className="workspace-message error product-form-error" role="alert">{error}</p>}
      <label>Nama produk<input required maxLength={120} value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value }))}/></label>
      <div className="workspace-form-grid"><label>Kategori<select value={productForm.category} onChange={event => setProductForm(current => ({ ...current, category: event.target.value }))}><option value="">Pilih kategori</option>{productCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label><label>Harga jual (Rp)<input type="number" min="0" step="1" required value={productForm.price} onChange={event => setProductForm(current => ({ ...current, price: event.target.value }))}/></label></div>
      <fieldset className="product-variants-field"><legend>Varian produk <small>(opsional, contoh: Cokelat, Matcha)</small></legend>{productVariants.map((variant, index) => <div className="product-variant-row" key={index}><input aria-label={`Varian ${index + 1}`} maxLength={50} placeholder={`Nama varian ${index + 1}`} value={variant} onChange={event => setProductVariants(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><button type="button" className="secondary-button" aria-label={`Hapus varian ${index + 1}`} onClick={() => setProductVariants(current => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15}/></button></div>)}{productVariants.length < 20 && <button type="button" className="add-product-variant" onClick={() => setProductVariants(current => [...current, ''])}><Plus size={15}/> Tambah varian</button>}</fieldset>
      <div className="workspace-form-grid"><label>Modal per produk (Rp)<input type="number" min="0" step="1" value={productForm.cost} onChange={event => setProductForm(current => ({ ...current, cost: event.target.value }))}/></label><label>Stok<input type="number" min="0" step="1" placeholder="Kosong = tanpa batas" value={productForm.stock} onChange={event => setProductForm(current => ({ ...current, stock: event.target.value }))}/></label></div>
      <label className="product-image-field">Foto produk (opsional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
        const file = event.target.files?.[0] ?? null
        if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          setProductImage(null)
          setError('Format foto harus PNG, JPG, atau WEBP.')
          event.target.value = ''
          return
        }
        if (file && file.size > 5 * 1024 * 1024) {
          setProductImage(null)
          setError('Ukuran foto maksimal 5 MB.')
          event.target.value = ''
          return
        }
        setError('')
        setProductImage(file)
      }}/><span>PNG, JPG, atau WEBP · Maksimal 5 MB</span>{productImagePreview ? <img className="product-image-preview" src={productImagePreview} alt="Pratinjau foto produk"/> : editingProduct?.image_url && <img className="product-image-preview" src={editingProduct.image_url} alt="Foto produk saat ini"/>}</label>
      <label>Deskripsi<textarea rows={3} value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))}/></label>
      <div className="workspace-modal-actions"><button type="button" className="secondary-button" onClick={closeProductForm}>Batal</button><button className="primary-button" disabled={saving}>{saving ? 'Menyimpan…' : editingProduct ? 'Simpan perubahan' : 'Simpan produk'}</button></div>
    </form></div>}

    {showBatchForm && <div className="modal-backdrop" onClick={closeBatchForm}><form className="workspace-modal" onClick={event => event.stopPropagation()} onSubmit={saveBatch}><div className="workspace-modal-heading"><div><span>PRE-ORDER</span><h2>{editingBatch ? 'Edit batch' : 'Buat batch baru'}</h2></div><button type="button" className="icon-button" onClick={closeBatchForm} aria-label="Tutup"><X size={18}/></button></div>
      {error && <p className="workspace-message error product-form-error" role="alert">{error}</p>}
      <label>Nama batch<input required maxLength={120} value={batchName} onChange={event => setBatchName(event.target.value)} placeholder="Contoh: Batch camilan minggu ini"/></label>
      <label>Waktu tutup<input type="datetime-local" required min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} value={batchClosesAt} onChange={event => setBatchClosesAt(event.target.value)}/></label>
      <fieldset className="workspace-product-picker"><legend>Pilih produk untuk dijual</legend>{products.filter(product => product.is_active).length ? products.filter(product => product.is_active).map(product => <label key={product.id}><input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={event => setSelectedProductIds(current => event.target.checked ? [...current, product.id] : current.filter(id => id !== product.id))}/><span>{product.name}</span><b>{money(product.price)}</b></label>) : <p>Tambahkan produk aktif terlebih dahulu.</p>}</fieldset>
      <div className="workspace-modal-actions"><button type="button" className="secondary-button" onClick={closeBatchForm}>Batal</button><button className="primary-button" disabled={saving || !products.some(product => product.is_active)}>{saving ? 'Menyimpan…' : editingBatch ? 'Simpan perubahan' : 'Buka batch'}</button></div>
    </form></div>}
    {viewProduct && <div className="modal-backdrop" onClick={() => setViewProduct(null)}><section className="workspace-modal workspace-detail-modal" onClick={event => event.stopPropagation()}><div className="workspace-modal-heading"><div><span>DETAIL PRODUK</span><h2>{viewProduct.name}</h2></div><button type="button" className="icon-button" onClick={() => setViewProduct(null)} aria-label="Tutup"><X size={18}/></button></div>{viewProduct.image_url && <img className="workspace-detail-image" src={viewProduct.image_url} alt={viewProduct.name}/>}<dl className="workspace-detail-list"><div><dt>Kategori</dt><dd>{viewProduct.category || 'Belum diatur'}</dd></div><div><dt>Harga jual</dt><dd>{money(viewProduct.price)}</dd></div><div><dt>Modal</dt><dd>{money(viewProduct.cost_price)}</dd></div><div><dt>Stok</dt><dd>{viewProduct.stock === null ? 'Tanpa batas' : viewProduct.stock}</dd></div><div><dt>Status</dt><dd>{viewProduct.is_active ? 'Aktif' : 'Nonaktif'}</dd></div>{viewProduct.variants.length > 0 && <div><dt>Varian</dt><dd>{viewProduct.variants.join(', ')}</dd></div>}</dl><div className="workspace-detail-description"><b>Deskripsi</b><p>{viewProduct.description || 'Belum ada deskripsi.'}</p></div><div className="workspace-modal-actions"><button className="secondary-button" onClick={() => setViewProduct(null)}>Tutup</button><button className="primary-button" onClick={() => { openProductForm(viewProduct); setViewProduct(null) }}><Pencil size={15}/> Edit produk</button></div></section></div>}
    {viewBatch && <div className="modal-backdrop" onClick={() => setViewBatch(null)}><section className="workspace-modal workspace-detail-modal" onClick={event => event.stopPropagation()}><div className="workspace-modal-heading"><div><span>DETAIL BATCH</span><h2>{viewBatch.name}</h2></div><button type="button" className="icon-button" onClick={() => setViewBatch(null)} aria-label="Tutup"><X size={18}/></button></div><dl className="workspace-detail-list"><div><dt>Status</dt><dd>{viewBatch.status === 'open' ? 'Dibuka' : viewBatch.status}</dd></div><div><dt>Waktu tutup</dt><dd>{viewBatch.closes_at ? new Date(viewBatch.closes_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : 'Tanpa batas waktu'}</dd></div><div><dt>Pesanan</dt><dd>{orders.filter(order => order.batch_id === viewBatch.id).length}</dd></div></dl><div className="workspace-detail-description"><b>Produk dalam batch</b>{batchProducts.filter(item => item.batch_id === viewBatch.id).map(item => { const product = products.find(candidate => candidate.id === item.product_id); return product ? <p key={product.id}>{product.name} · {money(item.price)}{item.stock_limit !== null ? ` · Stok ${item.stock_limit}` : ''}</p> : null })}</div><div className="workspace-modal-actions"><button className="secondary-button" onClick={() => setViewBatch(null)}>Tutup</button>{['open', 'draft'].includes(viewBatch.status) && <button className="primary-button" onClick={() => { openBatchForm(viewBatch); setViewBatch(null) }}><Pencil size={15}/> Edit batch</button>}</div></section></div>}
  </div>
}

function NavItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active: string; badge?: string; onClick: (value: string) => void }) {
  return <button className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onClick(label)}>{icon}<span>{label}</span>{badge && <small>{badge}</small>}</button>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="workspace-page-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="workspace-empty"><Package size={25}/><p>{text}</p></div>
}

function DataStat({ icon, title, value, foot }: { icon: React.ReactNode; title: string; value: string; foot: string }) {
  return <article className="workspace-stat"><span>{title}</span><i>{icon}</i><strong>{value}</strong><small>{foot}</small></article>
}

function ProductThumb({ product }: { product: Product }) {
  return <span className="workspace-product-thumb">{product.image_url ? <img src={product.image_url} alt=""/> : <Package size={19}/>}</span>
}

function ProductRow({ product, sold, onToggle, onView, onEdit }: { product: Product; sold: number; onToggle: () => void; onView: () => void; onEdit: () => void }) {
  return <article className="workspace-product-row"><ProductThumb product={product}/><div className="workspace-product-description"><b>{product.name}</b><span>{product.category || 'Tanpa kategori'} · {sold} terjual</span>{product.variants?.length > 0 && <span>Varian: {product.variants.join(', ')}</span>}</div><strong>{money(product.price)}</strong><span>{product.stock === null ? 'Stok tanpa batas' : `${product.stock} stok`}</span><button className={`product-toggle ${product.is_active ? 'enabled' : ''}`} onClick={onToggle}>{product.is_active ? 'Aktif' : 'Nonaktif'}</button><div className="workspace-row-actions"><button className="secondary-button" onClick={onView} aria-label={`Lihat ${product.name}`}><Eye size={15}/> Lihat</button><button className="secondary-button" onClick={onEdit} aria-label={`Edit ${product.name}`}><Pencil size={15}/> Edit</button></div></article>
}
