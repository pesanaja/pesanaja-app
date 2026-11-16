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

## Edukasi mingguan

Artikel terbaru disimpan di `education_articles` dan ditampilkan sesuai audience. Jika belum ada artikel tersinkronisasi atau Supabase belum tersedia, halaman tetap menampilkan panduan pilihan bawaan.

Untuk mengaktifkan sinkronisasi:

1. Terapkan migration `20261116180000_automated_education.sql` ke project Supabase.
2. Deploy Edge Function: `supabase functions deploy refresh-education`.
3. Atur secret `EDUCATION_FEEDS` sebagai JSON array. Setiap feed harus memiliki URL HTTPS, host sumber yang sama, nama sumber, kategori, dan audience:

   ```sh
   supabase secrets set EDUCATION_FEEDS='[{"url":"https://www.sba.gov/feed/","host":"www.sba.gov","sourceName":"U.S. Small Business Administration","category":"Usaha","audience":["seller"]}]'
   ```

   Contoh tersebut mengaktifkan artikel untuk penjual. Tambahkan feed RSS/Atom resmi dan tepercaya yang sudah diverifikasi untuk audience `buyer` agar artikel pembeli ikut diperbarui; jangan menebak URL feed. Satu sampai delapan feed dapat dikonfigurasi, dan kata kunci opsional dapat ditambahkan sebagai `"keywords":["usaha","pembayaran"]`.
4. Simpan `project_url` dan `service_role_key` di Supabase Vault (jangan menaruh service-role key di aplikasi atau repository):

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```

5. Jalankan isi `supabase/education-weekly-schedule.sql` di Supabase SQL Editor. Job akan berjalan setiap Senin pukul 02:00 UTC (09:00 WIB). File itu hanya berisi SQL penjadwalan; jangan tempel kode TypeScript Edge Function ke SQL Editor.

Sinkronisasi dibatasi pada artikel berusia paling lama 120 hari dan maksimal delapan artikel per feed. Untuk mengubah sumber, perbarui secret `EDUCATION_FEEDS`; untuk mengubah jadwal, sesuaikan file SQL dan jalankan ulang.

## Stack

- React + TypeScript + Vite
- Supabase Auth dan Postgres
- Dashboard penjual, katalog, dan checkout memerlukan Supabase
