# PesanAja

Platform pre-order berbasis batch untuk danusan dan UMKM mahasiswa. Pembeli menemukan produk kampus, memesan selama batch dibuka, dan melacak pembayaran; penjual mengelola batch, pesanan, dan ringkasan usaha.

## Menjalankan aplikasi

```sh
npm install
npm run dev
```

Isi `.env.local` dari `.env.example` untuk mengaktifkan Supabase Auth, dashboard, katalog, dan checkout. Data dashboard tidak diisi dengan contoh; dashboard mulai terisi setelah toko menambahkan produk atau menerima pesanan.

## Database

Skema awal tersedia sebagai migration di `supabase/migrations`. Terapkan setelah project Supabase dikonfirmasi untuk menerima perubahan. Migrasi mengaktifkan RLS pada semua tabel publik.

Untuk mengaktifkan katalog pembeli, checkout manual, dan dashboard penjual, terapkan semua migration secara berurutan, termasuk `20261108130000_buyer_checkout.sql`, `20261108140000_seller_nim_identity.sql`, `20261108150000_restrict_seller_email_domain.sql`, `20261108160000_create_seller_batch.sql`, `20261108170000_product_image_uploads.sql`, dan `20261108180000_product_variants.sql`. NIM penjual disimpan di tabel privat berindeks. Dashboard memakai produk, batch, pesanan, dan pembayaran dari Supabase; data baru tampil setelah pengguna membuatnya. Produk tampil di halaman belanja setelah toko terverifikasi, produk aktif, dan produk dimasukkan ke batch terbuka. Foto produk dapat diunggah sebagai PNG, JPG, atau WEBP hingga 5 MB. Penjual dapat menambahkan pilihan varian pada produk; pembeli memilih varian sebelum menambahkan produk ke keranjang. Checkout menyimpan pesanan dan bukti pembayaran di Supabase Storage; penjual mengonfirmasi pembayaran dari menu **Pesanan**.

## Stack

- React + TypeScript + Vite
- Supabase Auth dan Postgres
- Dashboard penjual, katalog, dan checkout memerlukan Supabase
