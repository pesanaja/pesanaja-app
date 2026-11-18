import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BookOpen, ChevronDown, CircleHelp, Clock3, Ellipsis, Eye, Pencil,
  LayoutDashboard, LogOut, Package, Plus, Search, Settings, ShieldCheck,
  ShoppingBag, ShoppingCart, Sparkles, Wallet, X, Save, Store, Phone, MapPin, CreditCard, Camera,
} from 'lucide-react'
import SellerOrders from './SellerOrders'
import { supabase } from './lib/supabase'
import { getOwnedProfileImagePath, removeProfileImage, uploadProfileImage, validateProfileImage } from './lib/profileImages'
import { isValidPersonName, normalizePersonName } from './lib/nameValidation'
import Education from './Education'

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
type OrderItem = { product_id: string; product_name: string; variant: string | null; quantity: number; line_total: number; unit_cost: number }
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
type Payment = { id: string; method: string | null; status: string; amount: number; created_at: string; installment_number: number | null; due_at: string | null; order: { order_number: string; status: string } | null }
type OperatingExpense = { id: string; description: string; amount: number; occurred_on: string }
type ProductForm = { name: string; category: string; description: string; price: string; cost: string; stock: string }

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const maxSafeMoney = Number.MAX_SAFE_INTEGER
const productSaveErrorMessage = (message: string) => /out of range for type integer/i.test(message)
  ? 'Harga melebihi batas database lama. Terapkan migration 20261118193000_expand_monetary_range_and_sync_batch_prices.sql di Supabase, lalu coba lagi.'
  : `Produk gagal disimpan: ${message}`
const productCategories = ['Makanan Berat & Bento', 'Kue dan Roti', 'Minuman', 'Lainnya']
const statusName = (status: string) => ({
  paid: 'Dibayar', completed: 'Dibayar', unpaid: 'Belum bayar', ordered: 'Belum bayar',
  installment: 'Dicicil', cancelled: 'Dibatalkan',
}[status] ?? status)
const transactionStatus = (orderStatus: string | undefined, paymentStatus: string) => {
  if (orderStatus === 'cancelled' || orderStatus === 'installment') return orderStatus
  return paymentStatus === 'paid' ? 'paid' : 'unpaid'
}
const methodName = (method: string | null) => ({ qris: 'QRIS', transfer: 'Transfer', cash: 'Tunai' }[method ?? ''] ?? 'Belum dipilih')
const localDateInput = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
type SellerProfileForm = { storeName: string; ownerName: string; phone: string; description: string; pickupLocation: string; paymentDetails: string; logoUrl: string | null; qrisImagePath: string | null }

export default function SellerWorkspace({ userId, storeName, onSignOut, onStoreNameChange }: { userId: string; storeName: string; onSignOut: () => void; onStoreNameChange: (name: string) => void }) {
  const [active, setActive] = useState('Ringkasan')
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchProducts, setBatchProducts] = useState<BatchProduct[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [operatingExpenses, setOperatingExpenses] = useState<OperatingExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [profilePopoverAnchor, setProfilePopoverAnchor] = useState<'workspace' | 'topbar' | null>(null)
  const [showProductForm, setShowProductForm] = useState(false)
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [viewProduct, setViewProduct] = useState<Product | null>(null)
  const [viewBatch, setViewBatch] = useState<Batch | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null)
  const [sellerProfile, setSellerProfile] = useState<SellerProfileForm>({ storeName, ownerName: '', phone: '', description: '', pickupLocation: '', paymentDetails: '', logoUrl: null, qrisImagePath: null })
  const [sellerNim, setSellerNim] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [qrisFile, setQrisFile] = useState<File | null>(null)
  const [qrisPreview, setQrisPreview] = useState('')
  const [removeQrisImage, setRemoveQrisImage] = useState(false)
  const [profileEmail, setProfileEmail] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [productForm, setProductForm] = useState<ProductForm>({ name: '', category: '', description: '', price: '', cost: '', stock: '' })
  const [productVariants, setProductVariants] = useState<string[]>([])
  const [productImage, setProductImage] = useState<File | null>(null)
  const [batchName, setBatchName] = useState('')
  const [batchClosesAt, setBatchClosesAt] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [productImagePreview, setProductImagePreview] = useState('')
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', occurredOn: localDateInput() })
  const [expenseSaving, setExpenseSaving] = useState(false)

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('')
      return
    }
    const previewUrl = URL.createObjectURL(logoFile)
    setLogoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [logoFile])

  useEffect(() => {
    if (!qrisFile) {
      setQrisPreview('')
      return
    }
    const previewUrl = URL.createObjectURL(qrisFile)
    setQrisPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [qrisFile])

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
    const [productsResult, batchesResult, batchProductsResult, ordersResult, paymentsResult, expensesResult, sellerResult, profileResult, identityResult, authResult] = await Promise.all([
      supabase.from('products').select('id,name,category,variants,description,image_url,price,cost_price,stock,is_active').eq('store_id', userId).order('created_at', { ascending: false }),
      supabase.from('preorder_batches').select('id,name,status,closes_at').eq('store_id', userId).order('created_at', { ascending: false }),
      supabase.from('batch_products').select('batch_id,product_id,price,stock_limit,batch:preorder_batches!inner(store_id)').eq('batch.store_id', userId),
      supabase.from('orders').select('id,batch_id,order_number,status,subtotal,total,created_at,buyer:profiles!orders_buyer_id_fkey(full_name),order_items(product_id,product_name,variant,quantity,line_total,unit_cost)').eq('store_id', userId).order('created_at', { ascending: false }),
      supabase.from('payments').select('id,method,status,amount,created_at,installment_number,due_at,order:orders!inner(order_number,status,store_id)').eq('order.store_id', userId).order('created_at', { ascending: false }),
      supabase.from('operating_expenses').select('id,description,amount,occurred_on').eq('store_id', userId).order('occurred_on', { ascending: false }),
      supabase.from('seller_profiles').select('store_name,description,pickup_location,payment_details,qris_image_path,logo_url,verification_status').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('full_name,phone').eq('id', userId).maybeSingle(),
      supabase.from('seller_identities').select('nim').eq('user_id', userId).maybeSingle(),
      supabase.auth.getSession(),
    ])
    const errors = [productsResult.error, batchesResult.error, batchProductsResult.error, ordersResult.error, paymentsResult.error, expensesResult.error, sellerResult.error, profileResult.error, identityResult.error].filter(Boolean)
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
    if (expensesResult.error) setOperatingExpenses([])
    else setOperatingExpenses((expensesResult.data ?? []) as OperatingExpense[])
    if (sellerResult.error) setVerificationStatus(null)
    else setVerificationStatus(sellerResult.data?.verification_status ?? null)
    if (profileResult.error) setError(`Profil usaha gagal dimuat: ${profileResult.error.message}`)
    else setSellerProfile(current => ({
      ...current,
      storeName: sellerResult.data?.store_name ?? storeName,
      description: sellerResult.data?.description ?? '',
      pickupLocation: sellerResult.data?.pickup_location ?? '',
      paymentDetails: sellerResult.data?.payment_details ?? '',
      logoUrl: sellerResult.data?.logo_url ?? null,
      qrisImagePath: sellerResult.data?.qris_image_path ?? null,
      ownerName: profileResult.data?.full_name ?? '',
      phone: profileResult.data?.phone ?? '',
    }))
    if (identityResult.error) setError(`NIM penjual gagal dimuat: ${identityResult.error.message}`)
    else setSellerNim(identityResult.data?.nim ?? '')
    if (authResult.error) setError(`Informasi akun gagal dimuat: ${authResult.error.message}`)
    else {
      setProfileEmail(authResult.data.session?.user.email ?? '')
      setVerificationStatus(sellerResult.data?.verification_status ?? null)
    }
    if (errors.length) setError(`Sebagian data dashboard gagal dimuat: ${errors.map(item => item?.message).join(' · ')}`)
    setLoading(false)
  }, [userId])

  useEffect(() => { void loadData() }, [loadData])

  async function saveSellerProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setError('Koneksi Supabase belum tersedia.')
      return
    }
    const ownerName = normalizePersonName(sellerProfile.ownerName)
    if (!isValidPersonName(ownerName)) {
      setError('Nama pemilik harus berisi huruf dan hanya boleh memakai spasi, tanda hubung, atau apostrof.')
      return
    }
    setError('')
    setNotice('')
    setProfileSaving(true)
    let uploadedPath: string | null = null
    let uploadedQrisPath: string | null = null
    try {
      let logoUrl = sellerProfile.logoUrl
      if (logoFile) {
        const uploaded = await uploadProfileImage(userId, logoFile)
        uploadedPath = uploaded.path
        logoUrl = uploaded.url
      }
      let qrisImagePath = removeQrisImage ? null : sellerProfile.qrisImagePath
      if (qrisFile) {
        const extension = qrisFile.type === 'image/png' ? 'png' : qrisFile.type === 'image/webp' ? 'webp' : 'jpg'
        uploadedQrisPath = `${userId}/${crypto.randomUUID()}.${extension}`
        const { error: qrisUploadError } = await supabase.storage.from('seller-qris').upload(uploadedQrisPath, qrisFile, { contentType: qrisFile.type, upsert: false })
        if (qrisUploadError) throw new Error(`Foto QRIS gagal diunggah: ${qrisUploadError.message}`)
        qrisImagePath = uploadedQrisPath
      }
      const { error: ownerError } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: ownerName,
        phone: sellerProfile.phone.trim() || null,
      }, { onConflict: 'id' })
      if (ownerError) throw new Error(`Informasi pemilik gagal disimpan: ${ownerError.message}`)
      const { error: storeError } = await supabase.from('seller_profiles').update({
        store_name: sellerProfile.storeName.trim(),
        description: sellerProfile.description.trim() || null,
        pickup_location: sellerProfile.pickupLocation.trim() || null,
        payment_details: sellerProfile.paymentDetails.trim() || null,
        qris_image_path: qrisImagePath,
        logo_url: logoUrl,
      }).eq('user_id', userId)
      if (storeError) throw new Error(`Informasi toko gagal disimpan: ${storeError.message}`)
      const oldPath = logoFile ? getOwnedProfileImagePath(sellerProfile.logoUrl, userId) : null
      const oldQrisPath = qrisFile || removeQrisImage ? sellerProfile.qrisImagePath : null
      setSellerProfile(current => ({ ...current, logoUrl, qrisImagePath }))
      setLogoFile(null)
      setQrisFile(null)
      setRemoveQrisImage(false)
      onStoreNameChange(sellerProfile.storeName.trim())
      setNotice('Profil toko berhasil diperbarui.')
      if (oldPath) {
        try { await removeProfileImage(oldPath) }
        catch (cleanupError) { setNotice(`Profil tersimpan, tetapi foto lama gagal dihapus: ${cleanupError instanceof Error ? cleanupError.message : 'Terjadi kesalahan.'}`) }
      }
      if (oldQrisPath && oldQrisPath !== qrisImagePath) {
        const { error: cleanupError } = await supabase.storage.from('seller-qris').remove([oldQrisPath])
        if (cleanupError) setNotice(`Profil tersimpan, tetapi foto QRIS lama gagal dihapus: ${cleanupError.message}`)
      }
    } catch (cause) {
      let message = cause instanceof Error ? cause.message : 'Profil toko gagal disimpan.'
      if (uploadedPath) {
        try { await removeProfileImage(uploadedPath) }
        catch (cleanupError) { message = `${message}. ${cleanupError instanceof Error ? cleanupError.message : 'Foto baru gagal dibersihkan.'}` }
      }
      if (uploadedQrisPath) {
        const { error: cleanupError } = await supabase.storage.from('seller-qris').remove([uploadedQrisPath])
        if (cleanupError) message = `${message}. Foto QRIS baru gagal dibersihkan: ${cleanupError.message}`
      }
      setError(message)
    } finally {
      setProfileSaving(false)
    }
  }

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
  const receivedPaymentTotal = payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0)
  const productCosts = paidOrders.reduce((sum, order) => sum + order.order_items.reduce((itemSum, item) => itemSum + item.unit_cost * item.quantity, 0), 0)
  const expenseTotal = operatingExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const netProfit = revenue - productCosts - expenseTotal
  const orderStatusCounts = {
    unpaid: orders.filter(order => ['ordered', 'unpaid'].includes(order.status)).length,
    cancelled: orders.filter(order => order.status === 'cancelled').length,
    paid: paidOrders.length,
    installment: orders.filter(order => order.status === 'installment').length,
  }
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

  async function saveOperatingExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setError('Koneksi Supabase belum tersedia.')
      return
    }
    const amount = Number(expenseForm.amount)
    if (!expenseForm.description.trim() || !Number.isSafeInteger(amount) || amount <= 0) {
      setError('Isi keterangan dan jumlah biaya yang valid.')
      return
    }
    setExpenseSaving(true)
    setError('')
    const { error: expenseError } = await supabase.from('operating_expenses').insert({
      store_id: userId,
      description: expenseForm.description.trim(),
      amount,
      occurred_on: expenseForm.occurredOn,
    })
    if (expenseError) setError(`Biaya operasional gagal disimpan: ${expenseError.message}`)
    else {
      setExpenseForm({ description: '', amount: '', occurredOn: localDateInput() })
      notify('Biaya operasional berhasil dicatat.')
      await loadData()
    }
    setExpenseSaving(false)
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const name = productForm.name.trim()
    const price = Number(productForm.price)
    const costPrice = Number(productForm.cost || 0)
    const stock = productForm.stock === '' ? null : Number(productForm.stock)
    if (!name) {
      setError('Nama produk wajib diisi dan tidak boleh hanya berisi spasi.')
      return
    }
    if (!Number.isSafeInteger(price) || price <= 0 || price > maxSafeMoney) {
      setError('Harga jual harus berupa bilangan bulat lebih dari Rp0.')
      return
    }
    if (!Number.isSafeInteger(costPrice) || costPrice < 0 || costPrice > maxSafeMoney) {
      setError('Modal harus berupa bilangan bulat Rp0 atau lebih.')
      return
    }
    if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0)) {
      setError('Stok harus berupa bilangan bulat nol atau lebih.')
      return
    }
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
      name,
      category: productForm.category || null,
      variants,
      description: productForm.description.trim() || null,
      price,
      cost_price: costPrice,
      stock,
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
          ? `${productSaveErrorMessage(saveError.message)}. Foto juga gagal dibersihkan: ${cleanupError.message}`
          : productSaveErrorMessage(saveError.message))
      } else setError(productSaveErrorMessage(saveError.message))
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

  const accountPopover = <div className="profile-popover"><b>{storeName}</b><span>Seller workspace</span><button className="profile-signout" onClick={onSignOut}><LogOut size={14}/> Keluar</button></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={() => setActive('Ringkasan')}><picture className="brand-art"><source media="(max-width: 850px)" srcSet="/assets/pesanaja-icon.svg"/><img src="/assets/pesanaja-logo.svg" alt="PesanAja"/></picture></a>
      <div className="workspace-switch-wrap"><button className="workspace-switch" onClick={() => setProfilePopoverAnchor(value => value === 'workspace' ? null : 'workspace')}><span className="shop-avatar">{sellerProfile.logoUrl ? <img src={sellerProfile.logoUrl} alt=""/> : storeName.slice(0, 1).toUpperCase()}</span><span className="workspace-text"><b>{storeName}</b><small>Dashboard Penjual</small></span><ChevronDown size={15} className="muted"/></button>{profilePopoverAnchor === 'workspace' && accountPopover}</div>
      <div className="menu-label">WORKSPACE</div>
      <nav className="main-nav">
        <NavItem icon={<LayoutDashboard/>} label="Ringkasan" active={active} onClick={setActive}/>
        <NavItem icon={<ShoppingCart/>} label="Riwayat pelanggan" badge={orders.length ? String(orders.length) : undefined} active={active} onClick={setActive}/>
        <NavItem icon={<Package/>} label="Produk" active={active} onClick={setActive}/>
        <NavItem icon={<Clock3/>} label="Batch pre-order" active={active} onClick={setActive}/>
        <NavItem icon={<Wallet/>} label="Keuangan" active={active} onClick={setActive}/>
      </nav>
      <div className="menu-label second-label">LAINNYA</div>
      <nav className="main-nav"><NavItem icon={<BookOpen/>} label="Belajar jualan" active={active} onClick={setActive}/><NavItem icon={<CircleHelp/>} label="Pusat bantuan" active={active} onClick={setActive}/></nav>
      <div className="sidebar-bottom">
        <div className="seller-tip"><div className="tip-icon"><Sparkles size={16}/></div><b>Jualan makin rapi</b><p>Kelola produk, batch, dan pesanan dari satu tempat.</p><button onClick={() => setActive('Produk')}>Kelola produk <ArrowRight size={14}/></button><span className="tip-orb"/></div>
        <button className="nav-item setting-item" disabled title="Pengaturan belum tersedia"><Settings size={18}/><span>Pengaturan</span></button>
        <button className={`profile-row ${active === 'Profil toko' ? 'active' : ''}`} onClick={() => { setActive('Profil toko'); setProfilePopoverAnchor(null) }}><span className="profile-pic">{sellerProfile.logoUrl ? <img src={sellerProfile.logoUrl} alt=""/> : storeName.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><b>{storeName}</b><small>Profil toko <ShieldCheck size={12}/></small></span><Ellipsis size={18} className="muted"/></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{active}</strong></div><div className="top-actions"><button className="icon-button help-button" aria-label="Pusat bantuan" onClick={() => setActive('Pusat bantuan')}><CircleHelp size={18}/></button><span className="top-divider"/><div className="seller-account-menu"><button className="seller-chip" onClick={() => setProfilePopoverAnchor(value => value === 'topbar' ? null : 'topbar')}><span className="online-dot"/>Mode penjual<ChevronDown size={14}/></button>{profilePopoverAnchor === 'topbar' && accountPopover}</div></div></header>
      {error && !showProductForm && !showBatchForm && active !== 'Profil toko' && <p className="workspace-message error" role="alert">{error}</p>}
      {notice && <p className="workspace-message success" role="status">{notice}</p>}
      {active === 'Profil toko' ? <section className="workspace-page seller-profile-page">
        <div className="seller-profile-banner"><div className="seller-profile-banner-mark">{logoPreview || sellerProfile.logoUrl ? <img src={logoPreview || sellerProfile.logoUrl || ''} alt="Foto toko"/> : <Store size={23}/>}</div><div><span>AKUN PENJUAL</span><h1>Profil Toko</h1><p>Perbarui informasi usaha yang dilihat pembeli sebelum memesan.</p></div><span className={`seller-verification ${verificationStatus === 'verified' ? 'verified' : ''}`}><ShieldCheck size={15}/>{verificationStatus === 'verified' ? 'Terverifikasi' : verificationStatus === 'rejected' ? 'Perlu diperiksa' : 'Menunggu verifikasi'}</span></div>
        <form className="seller-profile-form" onSubmit={saveSellerProfile}>
          <div className="seller-profile-section-heading"><div><h2>Informasi usaha</h2><p>Detail ini akan tampil di halaman toko pembeli.</p></div></div>
          <div className="seller-logo-editor">
            <span className="seller-logo-preview">{logoPreview || sellerProfile.logoUrl ? <img src={logoPreview || sellerProfile.logoUrl || ''} alt="Pratinjau foto toko"/> : <Store size={28}/>}</span>
            <div><b>Foto profil toko</b><small>JPG, PNG, atau WEBP · Maks. 5 MB</small><label className="seller-logo-upload" htmlFor="seller-profile-logo"><Camera size={15}/> Pilih foto</label><input id="seller-profile-logo" className="profile-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
              const file = event.target.files?.[0] ?? null
              if (file) {
                const validationError = validateProfileImage(file)
                if (validationError) { setError(validationError); event.target.value = ''; return }
              }
              setError('')
              setLogoFile(file)
              event.target.value = ''
            }}/></div>
          </div>
          <div className="seller-profile-fields">
            <label>Nama toko<input required maxLength={120} value={sellerProfile.storeName} onChange={event => setSellerProfile(current => ({ ...current, storeName: event.target.value }))} placeholder="Nama usaha"/></label>
            <label>NIM<input value={sellerNim} readOnly aria-readonly="true" placeholder="NIM belum tersedia"/><small>NIM tersimpan sebagai identitas akun penjual.</small></label>
            <label>Nama pemilik / penanggung jawab<input required maxLength={120} autoComplete="name" value={sellerProfile.ownerName} onChange={event => setSellerProfile(current => ({ ...current, ownerName: event.target.value }))} placeholder="Nama lengkap"/></label>
            <label>Email akun<input type="email" value={profileEmail} readOnly aria-readonly="true"/><small>Email penjual digunakan untuk masuk dan tidak dapat diubah di sini.</small></label>
            <label>Nomor WhatsApp<div className="seller-profile-input-icon"><Phone size={16}/><input type="tel" required maxLength={30} autoComplete="tel" value={sellerProfile.phone} onChange={event => setSellerProfile(current => ({ ...current, phone: event.target.value }))} placeholder="08xxxxxxxxxx"/></div></label>
            <label className="seller-profile-wide">Deskripsi toko<textarea rows={4} maxLength={1000} value={sellerProfile.description} onChange={event => setSellerProfile(current => ({ ...current, description: event.target.value }))} placeholder="Ceritakan produk dan keunikan tokomu…"/></label>
            <label>Lokasi pengambilan<div className="seller-profile-input-icon"><MapPin size={16}/><input maxLength={240} value={sellerProfile.pickupLocation} onChange={event => setSellerProfile(current => ({ ...current, pickupLocation: event.target.value }))} placeholder="Lokasi serah terima"/></div></label>
            <label>Informasi rekening / e-wallet<div className="seller-profile-input-icon"><CreditCard size={16}/><input maxLength={240} value={sellerProfile.paymentDetails} onChange={event => setSellerProfile(current => ({ ...current, paymentDetails: event.target.value }))} placeholder="Contoh: BCA 123456789 a.n. Nama"/></div></label>
            <div className="seller-qris-editor seller-profile-wide">
              <span className="seller-qris-preview">{qrisPreview ? <img src={qrisPreview} alt="Pratinjau QRIS"/> : sellerProfile.qrisImagePath && supabase && !removeQrisImage ? <img src={supabase.storage.from('seller-qris').getPublicUrl(sellerProfile.qrisImagePath).data.publicUrl} alt="QRIS toko"/> : <CreditCard size={25}/>}</span>
              <div><b>QRIS toko</b><small>PNG, JPG, atau WEBP · Maks. 5 MB</small><label className="seller-logo-upload" htmlFor="seller-qris-image"><Camera size={15}/>{qrisFile ? 'Ganti QRIS' : 'Pilih foto QRIS'}</label><input id="seller-qris-image" className="profile-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const file = event.target.files?.[0] ?? null
                if (file) {
                  const validationError = validateProfileImage(file)
                  if (validationError) { setError(validationError); event.target.value = ''; return }
                }
                setError('')
                setRemoveQrisImage(false)
                setQrisFile(file)
                event.target.value = ''
              }}/>{(qrisFile || sellerProfile.qrisImagePath) && <button className="seller-qris-remove" type="button" onClick={() => { setQrisFile(null); setRemoveQrisImage(true) }}>Hapus QRIS</button>}</div>
            </div>
          </div>
          {error && <p className="workspace-message error" role="alert">{error}</p>}
          <div className="seller-profile-form-footer"><span>Perubahan tersimpan setelah kamu memilih Simpan profil.</span><button className="primary-button" disabled={profileSaving}><Save size={16}/>{profileSaving ? 'Menyimpan…' : 'Simpan profil'}</button></div>
        </form>
      </section> : active === 'Belajar jualan' ? <section className="workspace-page"><Education role="seller"/></section> : active === 'Riwayat pelanggan' ? <SellerOrders storeId={userId}/> : active === 'Produk' ? <section className="workspace-page">
        <PageHeading eyebrow="KATALOG TOKO" title="Produk" description="Kelola produk yang tersedia di tokomu." action={<button className="primary-button" onClick={() => openProductForm()}><Plus size={17}/> Tambah produk</button>}/>
        <label className="workspace-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari produk"/></label>
        {loading ? <EmptyState text="Memuat produk…"/> : visibleProducts.length ? <div className="workspace-product-list">{visibleProducts.map(product => <ProductRow key={product.id} product={product} sold={soldByProduct.get(product.id) ?? 0} onToggle={() => void toggleProduct(product)} onView={() => setViewProduct(product)} onEdit={() => openProductForm(product)}/>)}</div> : <EmptyState text={search ? 'Produk tidak ditemukan.' : 'Belum ada produk. Tambahkan produk pertamamu untuk mulai berjualan.'}/>}
      </section> : active === 'Batch pre-order' ? <section className="workspace-page">
        <PageHeading eyebrow="JADWAL PENJUALAN" title="Batch pre-order" description="Buka batch dan pilih produk yang ingin dijual." action={<button className="primary-button" onClick={() => openBatchForm()} disabled={!products.some(product => product.is_active)}><Plus size={17}/> Buat batch</button>}/>
        {loading ? <EmptyState text="Memuat batch…"/> : batches.length ? <div className="workspace-batch-list">{batches.map(batch => <article className="workspace-batch-card" key={batch.id}><div><span className={`workspace-batch-status ${batch.status}`}>{batch.status === 'open' ? 'Dibuka' : batch.status === 'draft' ? 'Draft' : batch.status}</span><h2>{batch.name}</h2><p>{batchProducts.filter(item => item.batch_id === batch.id).length} produk · {batch.closes_at ? `Tutup ${new Date(batch.closes_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Tanpa batas waktu'}</p></div><span>{orders.filter(order => order.batch_id === batch.id).length} pesanan</span><div className="workspace-row-actions"><button className="secondary-button" onClick={() => void viewBatchProducts(batch)}><Eye size={15}/> Lihat</button>{['open', 'draft'].includes(batch.status) && <button className="secondary-button" onClick={() => openBatchForm(batch)}><Pencil size={15}/> Edit</button>}</div></article>)}</div> : <EmptyState text="Belum ada batch. Buat batch untuk menampilkan produk di halaman belanja."/>}
      </section> : active === 'Keuangan' ? <section className="workspace-page">
        <PageHeading eyebrow="RINGKASAN TRANSAKSI" title="Keuangan" description="Pantau pembayaran pesanan di tokomu."/>
        <div className="finance-total"><span>Total pembayaran diterima</span><strong>{money(receivedPaymentTotal)}</strong><small>Pembayaran penuh dan cicilan yang sudah dikonfirmasi</small></div>
        {loading ? <EmptyState text="Memuat transaksi…"/> : payments.length ? <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Pesanan</th><th>Tanggal</th><th>Metode</th><th>Jumlah</th><th>Status</th></tr></thead><tbody>{payments.map(payment => {
          const status = transactionStatus(payment.order?.status, payment.status)
          return <tr key={payment.id}><td>{payment.order?.order_number ?? 'Pesanan'}{payment.installment_number && <small className="payment-installment-label">{payment.installment_number === 1 ? 'Uang muka' : `Cicilan ${payment.installment_number} dari 3`}</small>}</td><td>{new Date(payment.created_at).toLocaleDateString('id-ID')}</td><td>{methodName(payment.method)}</td><td>{money(payment.amount)}</td><td><span className={`seller-order-status ${status}`}>{statusName(status)}</span></td></tr>
        })}</tbody></table></div> : <EmptyState text="Belum ada transaksi. Pembayaran akan muncul setelah pembeli memesan."/>}
      </section> : active === 'Pusat bantuan' ? <section className="workspace-page"><PageHeading eyebrow="PESANAJA" title={active} description="Konten pusat bantuan belum tersedia."/><EmptyState text="Panduan dan kontak bantuan akan ditambahkan di sini."/></section> : <section className="workspace-page">
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
          <section className="panel profit-loss-panel">
            <div className="panel-heading"><div><h3>Laporan Laba Rugi</h3><p>Akumulasi dari pesanan yang sudah dibayar penuh</p><small className="profit-loss-note">Modal pesanan lama memakai nilai modal produk saat migrasi.</small></div><strong className={netProfit < 0 ? 'profit-loss-negative' : 'profit-loss-positive'}>{money(netProfit)}</strong></div>
            <div className="profit-loss-metrics">
              <div><span>Omzet</span><strong>{money(revenue)}</strong></div>
              <div><span>Modal produk terjual</span><strong>{money(productCosts)}</strong></div>
              <div><span>Biaya operasional</span><strong>{money(expenseTotal)}</strong></div>
              <div className={netProfit < 0 ? 'profit-loss-negative' : 'profit-loss-positive'}><span>Laba / rugi bersih</span><strong>{money(netProfit)}</strong></div>
            </div>
            <form className="expense-entry-form" onSubmit={saveOperatingExpense}>
              <label>Keterangan<input required maxLength={160} value={expenseForm.description} onChange={event => setExpenseForm(current => ({ ...current, description: event.target.value }))} placeholder="Contoh: kemasan produk"/></label>
              <label>Jumlah (Rp)<input required type="number" min="1" step="1" value={expenseForm.amount} onChange={event => setExpenseForm(current => ({ ...current, amount: event.target.value }))} placeholder="0"/></label>
              <label>Tanggal<input required type="date" value={expenseForm.occurredOn} onChange={event => setExpenseForm(current => ({ ...current, occurredOn: event.target.value }))}/></label>
              <button className="primary-button" type="submit" disabled={expenseSaving}>{expenseSaving ? 'Menyimpan…' : 'Catat biaya'}</button>
            </form>
            {operatingExpenses.length > 0 && <div className="expense-recent-list"><b>Biaya operasional terbaru</b>{operatingExpenses.slice(0, 5).map(expense => <div key={expense.id}><span>{expense.description}<small>{new Date(`${expense.occurred_on}T00:00:00`).toLocaleDateString('id-ID', { dateStyle: 'medium' })}</small></span><strong>{money(expense.amount)}</strong></div>)}</div>}
          </section>
          <section className="order-status-summary" aria-label="Ringkasan status pesanan">
            <div className="unpaid"><span>Belum bayar</span><b>{orderStatusCounts.unpaid}</b></div>
            <div className="cancelled"><span>Dibatalkan</span><b>{orderStatusCounts.cancelled}</b></div>
            <div className="paid"><span>Dibayar</span><b>{orderStatusCounts.paid}</b></div>
            <div className="installment"><span>Dicicil</span><b>{orderStatusCounts.installment}</b></div>
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
      <div className="workspace-form-grid"><label>Kategori<select value={productForm.category} onChange={event => setProductForm(current => ({ ...current, category: event.target.value }))}><option value="">Pilih kategori</option>{productCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label><label>Harga jual (Rp)<input type="number" min="1" max={maxSafeMoney} step="1" required value={productForm.price} onChange={event => setProductForm(current => ({ ...current, price: event.target.value }))}/></label></div>
      <fieldset className="product-variants-field"><legend>Varian produk <small>(opsional, contoh: Cokelat, Matcha)</small></legend>{productVariants.map((variant, index) => <div className="product-variant-row" key={index}><input aria-label={`Varian ${index + 1}`} maxLength={50} placeholder={`Nama varian ${index + 1}`} value={variant} onChange={event => setProductVariants(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/><button type="button" className="secondary-button" aria-label={`Hapus varian ${index + 1}`} onClick={() => setProductVariants(current => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15}/></button></div>)}{productVariants.length < 20 && <button type="button" className="add-product-variant" onClick={() => setProductVariants(current => [...current, ''])}><Plus size={15}/> Tambah varian</button>}</fieldset>
      <div className="workspace-form-grid"><label>Modal per produk (Rp)<input type="number" min="0" max={maxSafeMoney} step="1" value={productForm.cost} onChange={event => setProductForm(current => ({ ...current, cost: event.target.value }))}/></label><label>Stok<input type="number" min="0" step="1" placeholder="Kosong = tanpa batas" value={productForm.stock} onChange={event => setProductForm(current => ({ ...current, stock: event.target.value }))}/></label></div>
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
