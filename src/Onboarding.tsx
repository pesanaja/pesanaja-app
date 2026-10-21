import { useState } from 'react'
import { BadgeCheck, Building2, Check, CreditCard, MapPin, MessageSquareText } from 'lucide-react'
import { supabase } from './lib/supabase'

const categories = ['Makanan Berat & Bento', 'Kue dan Roti', 'Lainnya']

type FormValues = { storeName: string; ownerName: string; location: string; whatsapp: string; payment: string }

export default function Onboarding({ onComplete }: { onComplete: (storeName: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [values, setValues] = useState<FormValues>({ storeName: '', ownerName: '', location: '', whatsapp: '', payment: '' })
  const [category, setCategory] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof FormValues, value: string) => setValues(current => ({ ...current, [key]: value }))

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!category.length) { setError('Pilih minimal satu kategori produk.'); return }
    setError('')
    setSaving(true)
    try {
      if (supabase) {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        if (user) {
          const slug = `${values.storeName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')}-${user.id.slice(0, 6)}`
          const { error: profileError } = await supabase.from('profiles').upsert({ id: user.id, full_name: values.ownerName, phone: values.whatsapp }, { onConflict: 'id' })
          if (profileError) throw profileError
          const { error: storeError } = await supabase.from('seller_profiles').upsert({ user_id: user.id, store_name: values.storeName, slug, product_categories: category, pickup_location: values.location, payment_details: values.payment || null }, { onConflict: 'user_id' })
          if (storeError) throw storeError
        }
      }
      localStorage.setItem('pesanaja-seller-profile', JSON.stringify({ ...values, category, completedAt: new Date().toISOString() }))
      setStep(2)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profil belum berhasil disimpan. Coba lagi.')
    } finally { setSaving(false) }
  }

  return <main className="onboarding-page"><section className="onboarding-wrap">
    <div className="onboarding-stepper"><div className="step-heading"><span className="step-number">{step}</span><span>Langkah {step}: {step === 1 ? 'Lengkapi Profil Usaha Anda' : 'Selesai'}</span></div><div className="step-bars"><i className={step === 1 ? 'current' : 'done'}/><i className={step === 2 ? 'current' : ''}/></div><div className="step-labels"><span>1. Detail Usaha</span><span>2. Selesai</span></div></div>
    <header className="onboarding-intro"><h1>Selamat Datang! Silahkan Lengkapi Profil Anda</h1><p>Yuk, lengkapi profil usaha Anda sebelum mulai</p></header>
    {step === 1 ? <form className="onboarding-form" onSubmit={saveProfile}>
      <div className="onboarding-fields two-col">
        <OnboardingField label="Nama Usaha/Kepanitiaan" required icon={<Building2/>} value={values.storeName} placeholder="Contoh: Toko Kue Saya" onChange={v => set('storeName', v)} />
        <OnboardingField label="Nama Pemilik/Organisasi" required icon={<Building2/>} value={values.ownerName} placeholder="Contoh: Nama pemilik atau organisasi" onChange={v => set('ownerName', v)} />
      </div>
      <fieldset className="category-field"><legend>Kategori Produk Utama yang Dijual <b>*</b></legend><div className="category-options">{categories.map((item, index) => <button type="button" key={item} className={`category-chip ${category.includes(item) ? 'selected' : ''}`} onClick={() => setCategory(current => current.includes(item) ? current.filter(c => c !== item) : [...current, item])}><span>{index === 0 ? '▤' : index === 1 ? '◉' : '•••'}</span>{item}</button>)}</div></fieldset>
      <OnboardingField label="Titik Kumpul / Pengambilan Pesanan Default" required icon={<MapPin/>} value={values.location} placeholder="Contoh: Selasar Gedung A Lantai 1 (Dekat Kantin) atau COD Area Kampus" onChange={v => set('location', v)} />
      <div className="onboarding-fields two-col"><OnboardingField label="Nomor WhatsApp" required icon={<MessageSquareText/>} value={values.whatsapp} placeholder="Contoh: 081234567890" onChange={v => set('whatsapp', v)} type="tel"/><OnboardingField label="Rekening / E-Wallet Pembayaran" icon={<CreditCard/>} value={values.payment} placeholder="Contoh: BCA 123456789 a.n. Nama" onChange={v => set('payment', v)} /></div>
      {error && <p className="onboarding-error" role="alert">{error}</p>}
      <button className="onboarding-submit" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Lanjut'}</button>
    </form> : <div className="onboarding-success"><div className="success-icon"><BadgeCheck size={42}/></div><h2>Profil Telah Dilengkapi!</h2><p>Informasi Anda telah tersimpan. Sekarang Anda dapat membuka dashboard</p><button className="onboarding-submit" onClick={() => onComplete(values.storeName)}>Ke Beranda <Check size={17}/></button></div>}
  </section></main>
}

function OnboardingField({ label, required, icon, value, placeholder, onChange, type = 'text' }: { label: string; required?: boolean; icon: React.ReactNode; value: string; placeholder: string; onChange: (value: string) => void; type?: string }) {
  return <label className="onboarding-field"><span>{label}{required && <b> *</b>}</span><div className="onboarding-input"><i>{icon}</i><input type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} required={required} /></div></label>
}
