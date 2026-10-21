import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown,
  CircleHelp, Clock3, CookingPot, Ellipsis, Filter, LayoutDashboard, Package,
  LogOut, Plus, Search, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles,
  TrendingUp, Users, Wallet,
  X,
} from 'lucide-react'
import Onboarding from './Onboarding'
import Auth from './Auth'
import { supabase } from './lib/supabase'

type OrderStatus = 'Dibayar' | 'Belum bayar' | 'Dicicil' | 'Selesai'
type Order = { id: string; buyer: string; initials: string; product: string; qty: number; total: number; status: OrderStatus; color: string; date: string }
type Product = { name: string; category: string; price: number; sold: number; stock: number; emoji: string; color: string }

const initialOrders: Order[] = [
  { id: 'PJA-2048', buyer: 'Nadia Putri', initials: 'NP', product: 'Puding Regal Cup', qty: 2, total: 24000, status: 'Dibayar', color: 'peach', date: '12 Okt, 10:24' },
  { id: 'PJA-2047', buyer: 'Rizky Ramadhan', initials: 'RR', product: 'Nasi Bakar Cakalang', qty: 3, total: 45000, status: 'Belum bayar', color: 'blue', date: '12 Okt, 09:48' },
  { id: 'PJA-2046', buyer: 'Siti Aulia', initials: 'SA', product: 'Es Kopi Susu Gula Aren', qty: 1, total: 18000, status: 'Dicicil', color: 'lilac', date: '12 Okt, 09:12' },
  { id: 'PJA-2045', buyer: 'Fajar Maulana', initials: 'FM', product: 'Puding Regal Cup', qty: 1, total: 12000, status: 'Dibayar', color: 'mint', date: '11 Okt, 16:32' },
  { id: 'PJA-2044', buyer: 'Dinda Maharani', initials: 'DM', product: 'Brownies Fudgy Box', qty: 1, total: 35000, status: 'Selesai', color: 'rose', date: '11 Okt, 15:04' },
]
const products: Product[] = [
  { name: 'Puding Regal Cup', category: 'Dessert', price: 12000, sold: 48, stock: 12, emoji: '🍮', color: 'product-peach' },
  { name: 'Es Kopi Susu Gula Aren', category: 'Minuman', price: 18000, sold: 36, stock: 8, emoji: '🧋', color: 'product-lilac' },
  { name: 'Nasi Bakar Cakalang', category: 'Makanan berat', price: 15000, sold: 29, stock: 15, emoji: '🍙', color: 'product-mint' },
]
const rupiah = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<'buyer' | 'seller'>('buyer')
  const [authReady, setAuthReady] = useState(!supabase)
  const [onboarded, setOnboarded] = useState(false)
  const [storeName, setStoreName] = useState('Kenangan Manis')
  const [active, setActive] = useState('Ringkasan')
  const [orders] = useState(initialOrders)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Semua status')
  const [showFilter, setShowFilter] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [toast, setToast] = useState('')
  const filtered = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.id} ${order.buyer} ${order.product}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (statusFilter === 'Semua status' || order.status === statusFilter)
  }), [orders, query, statusFilter])
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUserId(data.session?.user.id ?? null); setUserRole(data.session?.user.user_metadata.role === 'seller' ? 'seller' : 'buyer'); setAuthReady(true) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
      setUserRole(session?.user.user_metadata.role === 'seller' ? 'seller' : 'buyer')
      if (!session) { setOnboarded(false); localStorage.removeItem('pesanaja-seller-profile') }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!userId || !supabase) return
    let active = true
    void (async () => {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData.user
      if (!user) return
      await supabase.from('profiles').upsert({ id: user.id, full_name: user.user_metadata.full_name ?? '', phone: user.user_metadata.phone ?? null }, { onConflict: 'id' })
      if (user.user_metadata.role !== 'seller') { if (active) setOnboarded(true); return }
      const { data: store } = await supabase.from('seller_profiles').select('store_name').eq('user_id', user.id).maybeSingle()
      if (!active) return
      if (store?.store_name) { setStoreName(store.store_name); setOnboarded(true) }
      else setOnboarded(false)
    })()
    return () => { active = false }
  }, [userId])

  if (!authReady) return <div className="auth-loading">Memeriksa sesi PesanAja…</div>
  if (supabase && !userId) return <Auth onSignedIn={(id) => { setUserId(id); if (supabase) void supabase.auth.getUser().then(({ data }) => setUserRole(data.user?.user_metadata.role === 'seller' ? 'seller' : 'buyer')) }} />

  if (userRole === 'buyer') return <BuyerHome onSignOut={async () => { await supabase?.auth.signOut(); setUserId(null) }} />

  if (!onboarded) return <Onboarding onComplete={(name) => { setStoreName(name); setOnboarded(true) }} />

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={() => setActive('Ringkasan')}>
        <picture className="brand-art">
          <source media="(max-width: 850px)" srcSet="/assets/pesanaja-icon.svg" />
          <img src="/assets/pesanaja-logo.svg" alt="PesanAja" />
        </picture>
      </a>
      <div className="workspace-switch" onClick={() => setShowProfile(!showProfile)}>
        <div className="shop-avatar">{storeName.slice(0, 1).toUpperCase()}</div><div className="workspace-text"><b>{storeName}</b><small>Seller workspace</small></div><ChevronDown size={15} className="muted" />
      </div>
      <div className="menu-label">WORKSPACE</div>
      <nav className="main-nav">
        <NavItem icon={<LayoutDashboard />} label="Ringkasan" active={active} onClick={setActive} />
        <NavItem icon={<ShoppingCart />} label="Pesanan" badge="12" active={active} onClick={setActive} />
        <NavItem icon={<Package />} label="Produk" active={active} onClick={setActive} />
        <NavItem icon={<Clock3 />} label="Batch pre-order" active={active} onClick={setActive} />
        <NavItem icon={<Wallet />} label="Keuangan" active={active} onClick={setActive} />
      </nav>
      <div className="menu-label second-label">LAINNYA</div>
      <nav className="main-nav">
        <NavItem icon={<BookOpen />} label="Belajar jualan" active={active} onClick={setActive} />
        <NavItem icon={<CircleHelp />} label="Pusat bantuan" active={active} onClick={setActive} />
      </nav>
      <div className="sidebar-bottom">
        <div className="seller-tip"><div className="tip-icon"><Sparkles size={16} /></div><b>Jualan makin rapi ✨</b><p>Yuk, pelajari tips mengelola pre-order biar makin cuan!</p><button onClick={() => setActive('Belajar jualan')}>Mulai belajar <ArrowRight size={14} /></button><span className="tip-orb" /></div>
        <button className="nav-item setting-item" onClick={() => notify('Pengaturan akan segera tersedia')}><Settings size={18} /><span>Pengaturan</span></button>
        <div className="profile-row" onClick={() => setShowProfile(!showProfile)}><div className="profile-pic">{storeName.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><b>{storeName}</b><small>Penjual terverifikasi <ShieldCheck size={12} /></small></div><Ellipsis size={18} className="muted" /></div>
      </div>
      {showProfile && <div className="profile-popover"><b>{storeName}</b><span>Seller workspace</span><button onClick={() => notify('Profil toko dibuka')}>Lihat profil toko <ArrowUpRight size={14} /></button><button className="profile-signout" onClick={async () => { const { error } = supabase ? await supabase.auth.signOut() : { error: null }; if (error) { notify('Gagal keluar. Coba lagi.'); return } setShowProfile(false); setUserId(null) }}><LogOut size={14} /> Keluar</button></div>}
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{active}</strong></div>
        <div className="top-actions"><button className="icon-button help-button" onClick={() => notify('Pusat bantuan siap membantu')}><CircleHelp size={18} /></button><button className="icon-button notification-button" onClick={() => notify('Kamu tidak punya notifikasi baru')}><Bell size={18} /><i /></button><span className="top-divider" /><button className="seller-chip" onClick={() => setShowProfile(!showProfile)}><span className="online-dot" />Mode penjual<ChevronDown size={14} /></button></div>
      </header>
      <div className="page-content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> SENIN, 12 OKTOBER 2025</div><h1>Selamat pagi, {storeName} <span className="wave">✳</span></h1><p>Ini ringkasan tokomu hari ini. Semangat terus jualannya!</p></div><button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} strokeWidth={2.7} /> Buat batch baru</button></section>
        <section className="batch-banner"><div className="batch-deco deco-one"/><div className="batch-deco deco-two"/><div className="batch-content"><div className="batch-kicker"><span className="live-dot"/> BATCH SEDANG BERJALAN</div><h2>Batch #08 — Manis di Tengah Minggu</h2><p>Batch kamu berakhir dalam <b>1 hari 8 jam</b>. Jangan lupa cek pesanan yang masuk, ya!</p><div className="batch-meta"><span><Clock3 size={15}/> Tutup 13 Okt, 17.00</span><i/><span><ShoppingBag size={15}/> 28 pesanan masuk</span><i/><span><Users size={15}/> 21 pembeli</span></div></div><div className="batch-progress"><div className="progress-top"><span>Target batch</span><b>28 <small>/ 40 pesanan</small></b></div><div className="progress-track"><span/></div><div className="progress-bottom"><span>70% tercapai</span><span>12 lagi untuk target!</span></div><button onClick={() => { setActive('Batch pre-order'); notify('Batch #08 dibuka') }}>Lihat batch <ArrowRight size={14}/></button></div><div className="batch-spark">✳</div></section>

        <section className="stats-grid">
          <StatCard title="Total penjualan" value={rupiah(1842000)} icon={<Wallet size={19}/>} tone="mint" trend="12,8%" foot="dibanding minggu lalu" positive/><Sparkline variant="mint"/>
          <StatCard title="Pesanan masuk" value="28" icon={<ShoppingBag size={19}/>} tone="blue" trend="8,3%" foot="dibanding minggu lalu" positive/><Sparkline variant="blue"/>
          <StatCard title="Perlu diproses" value="7" icon={<Clock3 size={19}/>} tone="peach" trend="3 pesanan" foot="belum dibayar"/><div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
          <StatCard title="Produk terjual" value="96" icon={<Package size={19}/>} tone="lilac" trend="4 produk" foot="aktif di batch ini"/><div className="product-dots"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
        </section>

        <section className="insights-grid"><div className="panel revenue-panel"><div className="panel-heading"><div><h3>Performa penjualan</h3><p>Penjualan tokomu dalam 7 hari terakhir</p></div><button className="period-select" onClick={() => notify('Periode: 7 hari terakhir')}>7 hari terakhir <ChevronDown size={14}/></button></div><div className="revenue-legend"><span/><b>Penjualan</b><small>•</small><span className="legend-orders"/><b>Pesanan</b><div className="revenue-total"><small>Total minggu ini</small><b>Rp 1.842.000 <em><ArrowUpRight size={12}/> 12,8%</em></b></div></div><div className="chart-wrap"><div className="chart-y"><span>800rb</span><span>600rb</span><span>400rb</span><span>200rb</span><span>0</span></div><div className="chart-area"><div className="chart-gridlines"><i/><i/><i/><i/><i/></div><svg className="chart-svg" viewBox="0 0 720 190" preserveAspectRatio="none" aria-label="Grafik penjualan tujuh hari"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4768af" stopOpacity=".19"/><stop offset="100%" stopColor="#4768af" stopOpacity="0"/></linearGradient></defs><path d="M0 143 C34 139 51 143 80 125 S125 130 160 112 S205 118 240 109 S285 125 320 97 S365 103 400 89 S445 102 480 70 S525 79 560 60 S605 71 640 42 S685 48 720 24 L720 190 L0 190Z" fill="url(#chartFill)"/><path d="M0 143 C34 139 51 143 80 125 S125 130 160 112 S205 118 240 109 S285 125 320 97 S365 103 400 89 S445 102 480 70 S525 79 560 60 S605 71 640 42 S685 48 720 24" fill="none" stroke="#405e9e" strokeWidth="3" strokeLinecap="round"/><path d="M0 165 C34 163 51 157 80 158 S125 151 160 155 S205 148 240 151 S285 151 320 143 S365 148 400 139 S445 144 480 126 S525 138 560 119 S605 130 640 115 S685 112 720 101" fill="none" stroke="#91d7c1" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round"/></svg><div className="chart-x"><span>Sen, 6</span><span>Sel, 7</span><span>Rab, 8</span><span>Kam, 9</span><span>Jum, 10</span><span>Sab, 11</span><span>Min, 12</span></div></div></div></div>
          <div className="panel best-panel"><div className="panel-heading"><div><h3>Produk terlaris</h3><p>Favorit pembeli di batch ini</p></div><button className="more-button" onClick={() => { setActive('Produk'); notify('Menampilkan semua produk') }}><Ellipsis size={20}/></button></div><div className="best-list">{products.map((product, index) => <div className="best-item" key={product.name}><div className={`best-thumb ${product.color}`}>{product.emoji}</div><div className="best-info"><b>{product.name}</b><small>{product.category} · {product.sold} terjual</small></div><div className="best-price"><b>{rupiah(product.price)}</b><small>{index === 0 ? 'Paling laris' : `${product.stock} stok`}</small></div></div>)}</div><button className="text-link" onClick={() => setActive('Produk')}>Lihat semua produk <ArrowRight size={14}/></button></div></section>

        <section className="panel orders-panel"><div className="orders-head"><div><div className="heading-inline"><h3>Pesanan terbaru</h3><span className="count-pill">12 baru</span></div><p>Pantau dan kelola pesanan yang masuk ke tokomu</p></div><div className="order-tools"><label className="search-box"><Search size={16}/><input placeholder="Cari pesanan..." value={query} onChange={(event) => setQuery(event.target.value)}/><kbd>⌘ K</kbd></label><div className="filter-wrap"><button className={`filter-button ${showFilter ? 'filter-active' : ''}`} onClick={() => setShowFilter(!showFilter)}><Filter size={15}/> Filter <ChevronDown size={13}/></button>{showFilter && <div className="filter-menu">{['Semua status','Dibayar','Belum bayar','Dicicil','Selesai'].map(status => <button key={status} onClick={() => { setStatusFilter(status); setShowFilter(false) }}>{status}{status === statusFilter && <Check size={14}/>}</button>)}</div>}</div><button className="all-orders" onClick={() => setActive('Pesanan')}>Semua pesanan <ArrowRight size={14}/></button></div></div>
          <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Pilih semua pesanan"/></th><th>ID PESANAN <ArrowDown size={11}/></th><th>PEMBELI</th><th>PRODUK</th><th>JUMLAH</th><th>TOTAL</th><th>STATUS</th><th>WAKTU</th><th/></tr></thead><tbody>{filtered.map(order => <tr key={order.id}><td><input type="checkbox" aria-label={`Pilih ${order.id}`}/></td><td><b className="order-id">{order.id}</b></td><td><div className="buyer"><span className={`buyer-avatar ${order.color}`}>{order.initials}</span><b>{order.buyer}</b></div></td><td>{order.product}</td><td>{order.qty} item</td><td><b className="total-cell">{rupiah(order.total)}</b></td><td><Status status={order.status}/></td><td className="time-cell">{order.date}</td><td><button className="row-more" onClick={() => notify(`Detail ${order.id}`)}><Ellipsis size={17}/></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">Belum ada pesanan yang cocok dengan pencarianmu.</div>}</div>
          <div className="table-footer"><span>Menampilkan <b>{filtered.length ? 1 : 0}–{filtered.length}</b> dari <b>28</b> pesanan</span><div className="pagination"><button disabled>← Sebelumnya</button><button className="page-number">1</button><button className="page-number">2</button><button className="page-number">3</button><span>...</span><button className="page-number">6</button><button onClick={() => notify('Halaman berikutnya')}>Berikutnya →</button></div></div>
        </section>
        <footer className="footer"><span>© 2025 PesanAja</span><span>Dibuat dengan <b>✳</b> untuk pejuang cuan kampus</span><a href="#help" onClick={() => notify('Butuh bantuan? Kami siap membantu')}>Butuh bantuan?</a></footer>
      </div>
    </main>
    {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><div className="create-modal" onClick={(event) => event.stopPropagation()}><div className="modal-top"><div className="modal-icon"><CookingPot size={20}/></div><button className="icon-button" onClick={() => setShowCreate(false)}><X size={18}/></button></div><h2>Siap buka batch baru?</h2><p>Atur jadwal pre-order dan pilih produk yang ingin kamu jual. Pembeli bisa langsung pesan saat batch dibuka.</p><label>Nama batch<input defaultValue="Batch #09 —"/></label><label>Waktu tutup<input type="datetime-local" defaultValue="2025-10-15T17:00"/></label><div className="modal-actions"><button className="secondary-button" onClick={() => setShowCreate(false)}>Nanti dulu</button><button className="primary-button" onClick={() => { setShowCreate(false); setActive('Batch pre-order'); notify('Draft batch baru berhasil dibuat') }}>Simpan draft <ArrowRight size={15}/></button></div></div></div>}
    {toast && <div className="toast"><span><Check size={15}/></span>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>
}

function NavItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode; label: string; active: string; badge?: string; onClick: (value: string) => void }) {
  return <button className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onClick(label)}>{icon}<span>{label}</span>{badge && <small>{badge}</small>}</button>
}
function BuyerHome({ onSignOut }: { onSignOut: () => void }) {
  const [search, setSearch] = useState('')
  return <main className="buyer-home"><header><a className="brand" href="#home"><picture className="brand-art"><img src="/assets/pesanaja-logo.svg" alt="PesanAja" /></picture></a><button onClick={onSignOut}>Keluar</button></header><section className="buyer-welcome"><span>PRE-ORDER KAMPUS, LEBIH GAMPANG</span><h1>Lagi pengen jajan apa?</h1><p>Temukan makanan dan produk dari teman-teman kampusmu.</p><label><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari produk atau toko..."/></label></section><section className="buyer-empty"><div>🧺</div><h2>{search ? 'Belum ada produk yang cocok' : 'Belum ada pre-order aktif'}</h2><p>{search ? 'Coba kata kunci lain.' : 'Cek lagi nanti, ya. Toko kampus akan muncul di sini saat membuka batch.'}</p></section></main>
}
function StatCard({ title, value, icon, tone, trend, foot, positive }: { title: string; value: string; icon: React.ReactNode; tone: string; trend: string; foot: string; positive?: boolean }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><i className={`stat-icon ${tone}`}>{icon}</i></div><strong>{value}</strong><div className="stat-foot">{positive && <em><TrendingUp size={12}/> {trend}</em>}{!positive && <em className="neutral-trend">{trend}</em>}<span>{foot}</span></div></div>
}
function Sparkline({ variant }: { variant: 'mint' | 'blue' }) {
  return <svg className={`sparkline ${variant}`} viewBox="0 0 100 38" preserveAspectRatio="none"><path d={variant === 'mint' ? 'M0 31 C12 30 12 24 20 26 S31 30 39 20 S49 25 56 15 S66 17 73 11 S83 17 90 5 S96 10 100 2' : 'M0 27 C8 24 12 29 19 23 S29 21 36 24 S44 15 53 20 S61 15 68 17 S79 9 84 14 S92 7 100 4'} fill="none" stroke={variant === 'mint' ? '#71c7aa' : '#4768af'} strokeWidth="2.5" strokeLinecap="round"/></svg>
}
function Status({ status }: { status: OrderStatus }) {
  const cls = status === 'Dibayar' || status === 'Selesai' ? 'paid' : status === 'Dicicil' ? 'installment' : 'unpaid'
  return <span className={`status-pill ${cls}`}><i/>{status}</span>
}

export default App
