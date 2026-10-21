# PesanAja

Platform pre-order berbasis batch untuk danusan dan UMKM mahasiswa. Pembeli menemukan produk kampus, memesan selama batch dibuka, dan melacak pembayaran; penjual mengelola batch, pesanan, dan ringkasan usaha.

## Menjalankan aplikasi

```sh
npm install
npm run dev
```

Isi `.env.local` dari `.env.example` untuk mengaktifkan Supabase. Tanpa kredensial, aplikasi berjalan dengan data demo lokal.

## Database

Skema awal tersedia sebagai migration di `supabase/migrations`. Terapkan setelah project Supabase dikonfirmasi untuk menerima perubahan. Migrasi mengaktifkan RLS pada semua tabel publik.

## Stack

- React + TypeScript + Vite
- Supabase Auth dan Postgres
- Data demo untuk eksplorasi UI tanpa backend
