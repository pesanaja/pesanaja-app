import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, ExternalLink, RefreshCw, ShoppingBag } from 'lucide-react'
import { supabase } from './lib/supabase'

type Payment = { id: string; method: string | null; status: string; amount: number; proof_url: string | null; installment_number: number | null; due_at: string | null }
type OrderItem = { product_name: string; variant: string | null; quantity: number; line_total: number }
type SellerOrder = {
  id: string
  order_number: string
  status: string
  total: number
  created_at: string
  received_at: string | null
  buyer: { full_name: string | null } | null
  order_items: OrderItem[]
  payments: Payment[]
}

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const orderStatusName = (status: string) => ({
  ordered: 'Belum bayar', unpaid: 'Belum bayar', installment: 'Dicicil',
  paid: 'Dibayar', completed: 'Dibayar', cancelled: 'Dibatalkan',
}[status] ?? status)

export default function SellerOrders({ storeId }: { storeId: string }) {
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [search, setSearch] = useState('')
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
      .select('id,order_number,status,total,created_at,received_at,buyer:profiles!orders_buyer_id_fkey(full_name),order_items(product_name,variant,quantity,line_total),payments(id,method,status,amount,proof_url,installment_number,due_at)')
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

  const visibleOrders = orders.filter(order => {
    const query = search.trim().toLocaleLowerCase('id')
    return !query || [order.order_number, order.buyer?.full_name, ...(order.order_items ?? []).map(item => item.product_name)]
      .some(value => value?.toLocaleLowerCase('id').includes(query))
  })

  return <section className="seller-orders-page">
    <div className="seller-orders-heading"><div><span>WORKSPACE</span><h1>Riwayat Pelanggan</h1><p>Cari pesanan dan pantau status pembayaran serta penerimaan.</p></div><button onClick={() => void loadOrders()} disabled={loading}><RefreshCw size={15}/> Muat ulang</button></div>
    {error && <p className="seller-orders-message error" role="alert">{error}</p>}
    {notice && <p className="seller-orders-message success" role="status">{notice}</p>}
    {!loading && orders.length > 0 && <label className="seller-orders-search"><ShoppingBag size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama pembeli, produk, atau nomor pesanan"/></label>}
    {loading ? <div className="seller-orders-empty">Memuat pesanan…</div> : visibleOrders.length ? <div className="seller-orders-list">
      {visibleOrders.map(order => {
        const payments = [...(order.payments ?? [])].sort((a, b) => (a.installment_number ?? 1) - (b.installment_number ?? 1))
        const paid = order.status === 'paid' || order.status === 'completed'
        const statusClass = order.status === 'cancelled' ? 'cancelled' : order.status === 'installment' ? 'installment' : paid ? 'paid' : ''
        return <article className="seller-order-card" key={order.id}>
          <div className="seller-order-top"><div><b>{order.order_number}</b><span><Clock3 size={13}/>{new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span></div><span className={`seller-order-status ${order.received_at ? 'received' : statusClass}`}>{order.received_at ? 'Pesanan diterima' : orderStatusName(order.status)}</span></div>
          <p className="seller-order-buyer">Pembeli: <b>{order.buyer?.full_name || 'Pembeli'}</b></p>
          <div className="seller-order-items">{(order.order_items ?? []).map((item, index) => <div key={`${item.product_name}-${index}`}><span>{item.product_name}{item.variant ? ` (${item.variant})` : ''} × {item.quantity}</span><b>{money(item.line_total)}</b></div>)}</div>
          <div className="seller-order-bottom"><div><span>Total pembayaran</span><b>{money(order.total)}</b></div></div>
          {payments.map(payment => {
            const installmentNumber = payment.installment_number
            const blockedByEarlierInstallment = installmentNumber !== null
              && installmentNumber > 1
              && payments.some(previous => previous.installment_number !== null
                && previous.installment_number < installmentNumber
                && previous.status !== 'paid')
            return <div className="seller-payment-row" key={payment.id}>
              <div><b>{installmentNumber ? `${installmentNumber === 1 ? 'Uang muka' : `Cicilan ${installmentNumber}`} dari 3` : 'Pembayaran'}</b><span>{money(payment.amount)} · {payment.method === 'qris' ? 'QRIS' : payment.method === 'transfer' ? 'Transfer' : payment.method === 'cash' ? 'Tunai' : 'Belum dipilih'}{payment.due_at ? ` · Jatuh tempo ${new Date(payment.due_at).toLocaleDateString('id-ID')}` : ''}</span><small>{payment.status === 'paid' ? 'Dibayar' : 'Belum bayar'}</small></div>
              <div className="seller-order-actions">{payment.proof_url && (proofLinks[payment.proof_url] ? <a className="seller-proof-button" href={proofLinks[payment.proof_url]} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Buka bukti</a> : <button className="seller-proof-button" onClick={() => void openProof(payment.proof_url!)}><ExternalLink size={15}/> Lihat bukti</button>)}{payment.status === 'pending' && order.status !== 'cancelled' && <button className="seller-confirm-button" disabled={busyPayment === payment.id || blockedByEarlierInstallment} onClick={() => void confirmPayment(payment.id)}><Check size={15}/>{busyPayment === payment.id ? 'Memproses…' : blockedByEarlierInstallment ? 'Menunggu cicilan sebelumnya' : 'Konfirmasi pembayaran'}</button>}</div>
            </div>
          })}
        </article>
      })}
    </div> : <div className="seller-orders-empty"><ShoppingBag size={26}/><h2>{orders.length ? 'Tidak ada pesanan yang cocok' : 'Belum ada riwayat pelanggan'}</h2><p>{orders.length ? 'Coba nama atau nomor pesanan lain.' : 'Pesanan pembeli akan muncul di sini setelah mereka memesan.'}</p></div>}
  </section>
}
