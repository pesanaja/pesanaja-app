import { useEffect, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, BadgeCheck, BookOpenCheck, Camera, ClipboardList,
  CircleDollarSign, CreditCard, Lightbulb, PackageCheck, ShoppingBag, UsersRound,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type EducationRole = 'buyer' | 'seller'
type EducationArticle = {
  id: string
  title: string
  summary: string
  icon: typeof ShoppingBag
  category: string
  paragraphs: string[]
  tips: string[]
  sourceName: string
  sourceUrl: string
  publishedAt?: string
}
type SyncedArticle = { id: string; title: string; summary: string | null; body: string; category: string | null; source_name: string | null; source_url: string | null; published_at: string; synced_at: string | null }

const articles: Record<EducationRole, EducationArticle[]> = {
  buyer: [
    {
      id: 'smart-buyer',
      title: 'Be a Smart Buyer!',
      summary: 'Belanja produk kampus dengan lebih bijak. Cek informasi produk, harga, jadwal, dan ketentuan sebelum memesan.',
      icon: ShoppingBag,
      category: 'Belanja bijak',
      paragraphs: [
        'Belanja dari sesama mahasiswa bisa jadi cara seru menemukan makanan dan produk kreatif. Sebelum memesan, luangkan waktu untuk membaca informasi produk dan rencana pengeluaranmu.',
        'Pastikan pilihanmu sesuai kebutuhan dan anggaran. Memahami informasi sejak awal membantu menghindari salah paham setelah transaksi.',
      ],
      tips: [
        'Baca deskripsi, varian, harga, dan jumlah produk yang tersedia.',
        'Periksa jadwal pre-order dan waktu pengambilan pesanan.',
        'Pastikan lokasi pengambilan dan cara menghubungi penjual.',
        'Simpan bukti pembayaran dan konfirmasi pesanan.',
      ],
      sourceName: 'OJK — Perencanaan Keuangan',
      sourceUrl: 'https://sikapiuangmu.ojk.go.id/FrontEnd/CMS/Category/130',
    },
    {
      id: 'preorder-checklist',
      title: 'Cek Dulu Sebelum Checkout',
      summary: 'Checklist singkat supaya detail pesanan, pilihan pembayaran, dan jadwal pengambilan tidak terlewat.',
      icon: PackageCheck,
      category: 'Tips pembeli',
      paragraphs: [
        'Pembelian pre-order memiliki jadwal dan alur yang berbeda dari belanja barang siap kirim. Cek detail pesanan sebelum menyelesaikan checkout.',
        'Jika ada informasi yang belum jelas, tanyakan kepada penjual sebelum membayar. Simpan nomor pesanan dan bukti transaksi sampai pesanan diterima.',
      ],
      tips: [
        'Pastikan nama produk, jumlah, dan varian sudah benar.',
        'Cek kembali total pembayaran dan instruksi pembayaran.',
        'Catat jadwal serta titik pengambilan.',
        'Hubungi penjual bila ada perubahan atau kendala pesanan.',
      ],
      sourceName: 'OJK — Sikapi Uangmu',
      sourceUrl: 'https://sikapiuangmu.ojk.go.id/FrontEnd/CMS/Category/130',
    },
    {
      id: 'qris-aman',
      title: 'Kenali Pembayaran QRIS',
      summary: 'Ketahui cara kerja QRIS dan pastikan pembayaran dilakukan melalui aplikasi penyedia jasa pembayaran.',
      icon: CreditCard,
      category: 'Pembayaran',
      paragraphs: [
        'QRIS adalah standar kode QR pembayaran yang ditetapkan Bank Indonesia. Satu kode QRIS dapat menerima pembayaran dari berbagai aplikasi pembayaran yang mendukungnya.',
        'Sebelum mengonfirmasi, cek nama merchant dan nominal pada aplikasi pembayaran. Jangan membagikan PIN atau kode rahasia kepada siapa pun.',
      ],
      tips: [
        'Pindai kode QR melalui aplikasi pembayaran yang kamu gunakan.',
        'Periksa nama merchant dan nominal sebelum memasukkan PIN.',
        'Simpan bukti pembayaran setelah transaksi berhasil.',
        'Gunakan kanal resmi penyedia jasa pembayaran jika perlu bantuan.',
      ],
      sourceName: 'Bank Indonesia — QRIS',
      sourceUrl: 'https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/QRIS/default.aspx',
    },
    {
      id: 'atur-anggaran',
      title: 'Atur Anggaran Belanja',
      summary: 'Rencanakan pengeluaran agar belanja tetap sesuai kebutuhan dan kemampuan.',
      icon: CircleDollarSign,
      category: 'Keuangan pribadi',
      paragraphs: [
        'Menentukan batas pengeluaran sebelum berbelanja membantu kamu memprioritaskan kebutuhan dan menghindari keputusan yang terburu-buru.',
        'Catat pengeluaran secara sederhana dan tinjau kembali secara berkala agar kamu mengetahui ke mana uang digunakan.',
      ],
      tips: [
        'Tentukan anggaran belanja sebelum membuka katalog.',
        'Periksa total pesanan sebelum membayar.',
        'Sisihkan dana untuk kebutuhan utama terlebih dahulu.',
      ],
      sourceName: 'OJK — Sikapi Uangmu',
      sourceUrl: 'https://sikapiuangmu.ojk.go.id/FrontEnd/CMS/Category/130',
    },
    {
      id: 'simpan-bukti',
      title: 'Simpan Bukti Transaksi',
      summary: 'Jaga catatan pesanan dan bukti pembayaran sampai pesanan diterima.',
      icon: ClipboardList,
      category: 'Transaksi aman',
      paragraphs: [
        'Nomor pesanan dan bukti pembayaran dapat membantu pembeli serta penjual mencocokkan detail transaksi ketika ada pertanyaan.',
        'Gunakan fitur Pesanan Saya untuk melihat status dan jadwal pembayaran. Hindari membagikan data rahasia seperti PIN atau kata sandi.',
      ],
      tips: [
        'Pastikan nominal serta tujuan pembayaran benar.',
        'Simpan bukti transaksi pada tempat yang aman.',
        'Hubungi penjual melalui kanal yang disepakati jika status belum berubah.',
      ],
      sourceName: 'Bank Indonesia — Sistem Pembayaran',
      sourceUrl: 'https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/default.aspx',
    },
  ],
  seller: [
    {
      id: 'kenali-pembeli',
      title: 'Kenali Calon Pembelimu',
      summary: 'Pahami siapa yang membutuhkan produkmu dan cari tahu apa yang mereka pertimbangkan saat membeli.',
      icon: UsersRound,
      category: 'Strategi usaha',
      paragraphs: [
        'Memahami calon pembeli membantu penjual menentukan produk, harga, dan cara promosi yang lebih relevan. Mulailah dari lingkungan terdekat: kebutuhan mahasiswa, kebiasaan, dan waktu mereka berbelanja.',
        'Amati pertanyaan yang sering muncul dan masukan dari pembeli. Gunakan temuan tersebut untuk menyempurnakan produk serta informasi toko.',
      ],
      tips: [
        'Tentukan kelompok pembeli yang paling mungkin membutuhkan produk.',
        'Catat kebutuhan, kisaran harga, dan masukan yang sering disebut.',
        'Amati produk serupa untuk menemukan hal yang bisa kamu tawarkan.',
        'Uji ide dalam skala kecil dan evaluasi respons pembeli.',
      ],
      sourceName: 'U.S. Small Business Administration — Market research',
      sourceUrl: 'https://www.sba.gov/business-guide/plan-your-business/market-research-competitive-analysis',
    },
    {
      id: 'promosi-produk',
      title: 'Buat Promosi yang Jelas',
      summary: 'Tampilkan keunggulan produk, harga, dan cara pemesanan dengan informasi yang mudah dipahami.',
      icon: Lightbulb,
      category: 'Pemasaran',
      paragraphs: [
        'Promosi yang baik membantu calon pembeli memahami apa yang dijual, manfaatnya, dan bagaimana cara memesan. Pesan yang konsisten dan spesifik lebih mudah dipahami daripada klaim yang terlalu umum.',
        'Pilih saluran promosi yang biasa digunakan calon pembelimu, lalu evaluasi responsnya untuk mengetahui informasi mana yang paling membantu.',
      ],
      tips: [
        'Gunakan nama dan foto produk yang jelas.',
        'Cantumkan harga, varian, batas pemesanan, dan jadwal pengambilan.',
        'Sampaikan keunikan produk secara jujur dan spesifik.',
        'Perbarui informasi promosi ketika stok atau jadwal berubah.',
      ],
      sourceName: 'U.S. Small Business Administration — Marketing and sales',
      sourceUrl: 'https://www.sba.gov/business-guide/manage-your-business/marketing-sales',
    },
    {
      id: 'foto-produk',
      title: 'Foto Produk Lebih Menarik',
      summary: 'Gunakan foto yang terang dan informatif agar calon pembeli mendapat gambaran produk yang akurat.',
      icon: Camera,
      category: 'Katalog produk',
      paragraphs: [
        'Foto adalah salah satu informasi pertama yang dilihat calon pembeli. Foto yang terang, fokus, dan menunjukkan produk apa adanya dapat membantu pembeli membuat pilihan.',
        'Tidak perlu alat khusus untuk memulai. Rapikan latar, gunakan cahaya yang cukup, dan pastikan hasil foto sesuai dengan produk yang akan diterima pembeli.',
      ],
      tips: [
        'Ambil foto di tempat terang dengan latar yang tidak ramai.',
        'Pastikan produk terlihat utuh dan fokus.',
        'Tampilkan ukuran atau detail penting bila relevan.',
        'Gunakan foto asli dan hindari edit yang mengubah tampilan produk.',
      ],
      sourceName: 'U.S. Small Business Administration — Marketing and sales',
      sourceUrl: 'https://www.sba.gov/business-guide/manage-your-business/marketing-sales',
    },
    {
      id: 'pembayaran-qris',
      title: 'Terima Pembayaran QRIS',
      summary: 'Pelajari standar QRIS dan bagaimana metode pembayaran digital dapat mendukung transaksi usaha.',
      icon: CircleDollarSign,
      category: 'Pembayaran',
      paragraphs: [
        'Bank Indonesia menjelaskan QRIS sebagai standar kode QR pembayaran nasional. Merchant dapat menerima pembayaran dari berbagai aplikasi yang mendukung QRIS melalui penyedia jasa pembayaran yang berizin.',
        'Pastikan proses pembayaran dan pencatatan transaksi jelas. Konfirmasikan pesanan setelah pembayaran diterima pada kanal merchant yang resmi.',
      ],
      tips: [
        'Daftar QRIS melalui penyedia jasa pembayaran yang berizin BI.',
        'Cek notifikasi transaksi pada aplikasi merchant, bukan hanya dari tangkapan layar.',
        'Catat transaksi dan cocokkan dengan pesanan yang masuk.',
        'Jelaskan kepada pembeli metode pembayaran yang tersedia.',
      ],
      sourceName: 'Bank Indonesia — QRIS',
      sourceUrl: 'https://www.bi.go.id/id/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/QRIS/default.aspx',
    },
    {
      id: 'catat-keuangan',
      title: 'Catat Keuangan Usaha',
      summary: 'Pisahkan catatan usaha dari pengeluaran pribadi agar kondisi usaha lebih mudah dipantau.',
      icon: CircleDollarSign,
      category: 'Keuangan usaha',
      paragraphs: [
        'Catatan sederhana tentang penjualan, biaya bahan, dan biaya operasional membantu penjual memahami hasil usaha.',
        'Simpan bukti transaksi dan perbarui catatan secara rutin. Gunakan data tersebut saat menentukan harga dan merencanakan stok.',
      ],
      tips: [
        'Catat pemasukan dan biaya pada hari yang sama.',
        'Simpan bukti transaksi dengan tanggal dan keterangan.',
        'Tinjau ringkasan usaha secara berkala.',
      ],
      sourceName: 'U.S. Small Business Administration — Manage your finances',
      sourceUrl: 'https://www.sba.gov/business-guide/manage-your-business/manage-your-finances',
    },
  ],
}

export default function Education({ role }: { role: EducationRole }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncedArticles, setSyncedArticles] = useState<EducationArticle[]>([])
  const [syncLoading, setSyncLoading] = useState(true)
  const [syncError, setSyncError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setSyncLoading(true)
    setSyncError('')
    setSyncedArticles([])
    setLastUpdated(null)
    async function loadSyncedArticles() {
      if (!supabase) {
        if (active) setSyncLoading(false)
        return
      }
      try {
        const { data, error } = await supabase
          .from('education_articles')
          .select('id,title,summary,body,category,source_name,source_url,published_at,synced_at')
          .contains('audience', [role])
          .not('source_url', 'is', null)
          .not('published_at', 'is', null)
          .lte('published_at', new Date().toISOString())
          .order('published_at', { ascending: false })
          .limit(8)
        if (!active) return
        if (error) setSyncError(`Artikel mingguan belum dapat dimuat: ${error.message}`)
        else {
          const rows = (data ?? []) as SyncedArticle[]
          setSyncedArticles(rows.flatMap(article => article.source_url ? [{
            id: article.id,
            title: article.title,
            summary: article.summary || article.body,
            icon: BookOpenCheck,
            category: article.category || 'Edukasi',
            paragraphs: [article.summary || article.body].filter(Boolean),
            tips: [],
            sourceName: article.source_name || 'Sumber artikel',
            sourceUrl: article.source_url,
            publishedAt: article.published_at,
          }] : []))
          const syncDates = rows.map(article => article.synced_at).filter((value): value is string => Boolean(value)).sort()
          setLastUpdated(syncDates[syncDates.length - 1] ?? null)
        }
      } catch (cause) {
        if (active) setSyncError(`Artikel mingguan belum dapat dimuat: ${cause instanceof Error ? cause.message : 'terjadi kesalahan jaringan'}`)
      } finally {
        if (active) setSyncLoading(false)
      }
    }
    void loadSyncedArticles()
    return () => { active = false }
  }, [role])

  const curatedArticles = articles[role]
  const roleArticles = syncedArticles.length >= 5
    ? syncedArticles
    : [...syncedArticles, ...curatedArticles.filter(article => !syncedArticles.some(synced => synced.id === article.id))].slice(0, 5)
  const selectedArticle = roleArticles.find(article => article.id === selectedId)
  const roleName = role === 'buyer' ? 'Pembeli' : 'Penjual'

  if (selectedArticle) {
    const Icon = selectedArticle.icon
    return <section className={`education-library education-library-${role}`}>
      <button className="education-back" onClick={() => setSelectedId(null)}><ArrowLeft size={17}/> Kembali ke edukasi</button>
      <header className="education-detail-hero">
        <div className={`education-art education-art-${selectedArticle.id}`}><Icon size={64} strokeWidth={1.4}/></div>
        <div className="education-detail-copy">
          <span className="education-detail-eyebrow">{selectedArticle.category} · Untuk {roleName.toLowerCase()}</span>
          <h1>{selectedArticle.title}</h1>
          <p>{selectedArticle.summary}</p>
        </div>
      </header>
      <article className="education-detail-body">
        {selectedArticle.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        <h2>Yang bisa kamu lakukan</h2>
        <ul>{selectedArticle.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
        <a className="education-source-link" href={selectedArticle.sourceUrl} target="_blank" rel="noreferrer">
          Baca sumber: {selectedArticle.sourceName}<ArrowUpRight size={16}/>
        </a>
      </article>
    </section>
  }

  return <section className={`education-library education-library-${role}`}>
    <header className="education-library-heading">
      <div><span>PESANAJA</span><h1>{role === 'buyer' ? 'Edukasi Pembeli' : 'Belajar Jualan'}</h1><p>{role === 'buyer' ? 'Panduan singkat agar belanja pre-order makin nyaman.' : 'Ide dan panduan untuk mengembangkan tokomu.'}</p></div>
      {lastUpdated && <small className="education-updated">Diperbarui {new Date(lastUpdated).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</small>}
    </header>
    {syncError && <p className="education-sync-warning" role="status">{syncError}</p>}
    {syncLoading && <p className="education-sync-status" role="status">Memeriksa artikel terbaru…</p>}
    <div className="education-library-grid">
      {roleArticles.map(article => {
        const Icon = article.icon
        return <article className="education-library-card" key={article.id}>
          <div className={`education-art education-art-${article.id}`}><Icon size={54} strokeWidth={1.5}/><span className="education-art-spark">✦</span></div>
          <div className="education-library-card-content">
            <div className="education-card-title"><h2>{article.title}</h2><span><BadgeCheck size={13}/>{roleName}</span></div>
            <small className="education-card-category"><BookOpenCheck size={13}/>{article.category}</small>
            <p>{article.summary}</p>
            <small className="education-source-name">Sumber: {article.sourceName}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}` : ''}</small>
            <button className="education-read-button" onClick={() => setSelectedId(article.id)}>Baca</button>
          </div>
        </article>
      })}
    </div>
  </section>
}
