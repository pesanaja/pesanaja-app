import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, ExternalLink, RefreshCw, ShoppingBag } from 'lucide-react'
import { supabase } from './lib/supabase'

type Payment = { id: string; method: string | null; status: string; proof_url: string | null }
type OrderItem = { product_name: string; variant: string | null; quantity: number; line_total: number }
type SellerOrder = {
  id: string
  order_number: string
  status: string
  total: number
  created_at: string
  buyer: { full_name: string | null } | null
  order_items: OrderItem[]
  payments: Payment[]
}

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

export default function SellerOrders({ storeId }: { storeId: string }) {
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyPayment, setBusyPayment] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [proofLinks, setProofLinks] = useState<Record<string, string>>({})

  const loadOrders = useCallback(async () => {
    if (!supabase || !storeId) {
      setError('Sesi penjual tidak tersedia. Silakan masuk kembali.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('orders')
      .select('id,order_number,status,total,created_at,buyer:profiles!orders_buyer_id_fkey(full_name),order_items(product_name,variant,quantity,line_total),payments(id,method,status,proof_url)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
    if (loadError) setError(`Pesanan gagal dimuat: ${loadError.message}`)
    else setOrders((data ?? []) as unknown as SellerOrder[])
    setLoading(false)
  }, [storeId])

  useEffect(() => { void loadOrders() }, [loadOrders])

  async function confirmPayment(paymentId: string) {
    if (!supabase) return
    setBusyPayment(paymentId)
    setError('')
    setNotice('')
    const { error: confirmError } = await supabase.rpc('confirm_payment', { p_payment_id: paymentId })
    if (confirmError) setError(`Pembayaran gagal dikonfirmasi: ${confirmError.message}`)
    else {
      setNotice('Pembayaran dikonfirmasi dan pesanan diperbarui.')
      await loadOrders()
    }
    setBusyPayment(null)
  }

  async function openProof(path: string) {
    if (!supabase) return
    const { data, error: proofError } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 300)
    if (proofError) { setError(`Bukti pembayaran gagal dibuka: ${proofError.message}`); return }
    setProofLinks(current => ({ ...current, [path]: data.signedUrl }))
  }

  return <section className="seller-orders-page">
    <div className="seller-orders-heading"><div><span>WORKSPACE</span><h1>Pesanan Masuk</h1><p>Periksa bukti pembayaran dan konfirmasi pesanan dari pembeli.</p></div><button onClick={() => void loadOrders()} disabled={loading}><RefreshCw size={15}/> Muat ulang</button></div>
    {error && <p className="seller-orders-message error" role="alert">{error}</p>}
    {notice && <p className="seller-orders-message success" role="status">{notice}</p>}
    {loading ? <div className="seller-orders-empty">Memuat pesanan…</div> : orders.length ? <div className="seller-orders-list">
      {orders.map(order => {
        const payment = order.payments?.[0]
        const paid = payment?.status === 'paid' || order.status === 'paid' || order.status === 'completed'
        return <article className="seller-order-card" key={order.id}>
          <div className="seller-order-top"><div><b>{order.order_number}</b><span><Clock3 size={13}/>{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span></div><span className={`seller-order-status ${paid ? 'paid' : ''}`}>{paid ? 'Dikonfirmasi' : 'Menunggu pembayaran'}</span></div>
          <p className="seller-order-buyer">Pembeli: <b>{order.buyer?.full_name || 'Pembeli'}</b></p>
          <div className="seller-order-items">{(order.order_items ?? []).map((item, index) => <div key={`${item.product_name}-${index}`}><span>{item.product_name}{item.variant ? ` (${item.variant})` : ''} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div>
          <div className="seller-order-bottom"><div><span>Total pembayaran</span><b>{money(order.total)}</b><small>Metode: {payment?.method === 'qris' ? 'QRIS' : payment?.method === 'transfer' ? 'Transfer ke penjual' : payment?.method === 'cash' ? 'Tunai' : 'Belum dipilih'}</small></div>
            <div className="seller-order-actions">{payment?.proof_url && (proofLinks[payment.proof_url] ? <a className="seller-proof-button" href={proofLinks[payment.proof_url]} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Buka bukti</a> : <button className="seller-proof-button" onClick={() => void openProof(payment.proof_url!)}><ExternalLink size={15}/> Lihat bukti</button>)}{payment && !paid && <button className="seller-confirm-button" disabled={busyPayment === payment.id} onClick={() => void confirmPayment(payment.id)}><Check size={15}/>{busyPayment === payment.id ? 'Memproses…' : 'Konfirmasi pembayaran'}</button>}</div>
          </div>
        </article>
      })}
    </div> : <div className="seller-orders-empty"><ShoppingBag size={26}/><h2>Belum ada pesanan masuk</h2><p>Pesanan pembeli akan muncul di sini.</p></div>}
  </section>
}
