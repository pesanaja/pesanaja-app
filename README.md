# PesanAja

Platform pre-order berbasis batch untuk danusan dan UMKM mahasiswa. Pembeli menemukan produk kampus, memesan selama batch dibuka, dan melacak pembayaran; penjual mengelola batch, pesanan, dan ringkasan usaha.

## Menjalankan aplikasi

```sh
npm install
npm run dev
```

Isi `.env.local` dari `.env.example` untuk mengaktifkan Supabase Auth, dashboard, katalog, dan checkout. Data dashboard tidak diisi dengan contoh; dashboard mulai terisi setelah toko menambahkan produk atau menerima pesanan.

## Reset kata sandi

1. Di Supabase Dashboard buka **Authentication → URL Configuration**. Atur **Site URL** ke alamat aplikasi produksi dan tambahkan alamat lokal/produksi ke **Redirect URLs**, misalnya `http://localhost:5173/**` dan `https://domain-aplikasi-kamu/**`.
2. Buka **Authentication → Email Templates → Reset Password**. Pastikan tombol tautan menggunakan `{{ .ConfirmationURL }}`; jangan menggantinya dengan `{{ .SiteURL }}` karena itu hanya membuka halaman awal. Template yang bisa disalin ke Supabase ada di `supabase/email-templates/reset-password.html`; subjeknya ada di `reset-password-subject.txt`.
3. Halaman aplikasi menerima tautan reset di `/?recovery=password` dan menampilkan form **Buat Kata Sandi Baru**. Ganti kata sandi, lalu gunakan tombol kembali ke halaman masuk.

## Database

Skema awal tersedia sebagai migration di `supabase/migrations`. Terapkan setelah project Supabase dikonfirmasi untuk menerima perubahan. Migrasi mengaktifkan RLS pada semua tabel publik.

Untuk project baru, terapkan **semua** file `.sql` di `supabase/migrations` melalui SQL Editor, satu per satu menurut urutan timestamp pada nama file; jangan melewati migration perantara. Pada project yang sudah berisi data, periksa dahulu migration mana yang sudah diterapkan agar tidak mengulang perubahan secara manual. Migration terbaru `20261118213000_installment_cancellation_and_inventory.sql` menyiapkan ringkasan status cicilan, alasan pembatalan penjual, bukti transfer berbentuk foto, dan pengurangan/pengembalian stok. Migration ini juga mengurangi stok untuk pesanan aktif yang sudah ada saat pertama kali dijalankan; jangan menjalankannya ulang secara manual setelah berhasil. Migration sebelumnya adalah `20261118190000_finance_installments.sql`, `20261118193000_expand_monetary_range_and_sync_batch_prices.sql`, dan `20261118200000_qris_variants_and_order_receipt.sql`; semuanya bergantung pada schema dan fitur checkout sebelumnya. Migration QRIS menambahkan foto QRIS toko, konfirmasi penerimaan pesanan, validasi metode bayar di database, dan pemesanan beberapa varian. Migration finance memperluas nominal uang dan menyinkronkan harga produk ke batch yang masih terbuka. Produk tampil hanya jika toko terverifikasi, produknya aktif, dan produk dimasukkan ke batch terbuka. Foto produk di katalog berasal dari foto yang diunggah penjual. Checkout menyimpan pesanan dan bukti pembayaran di Supabase Storage.

## Edukasi mingguan

Artikel RSS/Atom disimpan di `education_articles` dan ditampilkan sesuai audience. Cover diambil dari `media:thumbnail`, `media:content`, `enclosure` gambar, atau gambar di isi artikel RSS/Atom; sumber harus menyediakan gambar HTTPS agar cover dapat tampil. Halaman edukasi menampilkan minimal lima bacaan dengan memadukan artikel terbaru dan panduan pilihan bila artikel sinkron belum mencapai lima.

### Konfigurasi pembaruan mingguan

1. Pastikan project Supabase yang benar sudah dipilih. Terapkan migration `20261116180000_automated_education.sql` melalui **SQL Editor** atau dengan Supabase CLI.
2. Pada **Database → Extensions**, pastikan `pg_cron` dan `pg_net` aktif. Pastikan **Database → Vault** tersedia untuk menyimpan rahasia yang dipakai Cron.
3. Dari terminal di folder project, hubungkan project lalu deploy Edge Function. Ganti `PROJECT_REF_ANDA` dengan Project ID dari **Project Settings → General**:

   ```sh
   npx supabase link --project-ref PROJECT_REF_ANDA
   npx supabase functions deploy refresh-education
   ```

4. Di **Edge Functions → Secrets**, tambahkan secret bernama `EDUCATION_FEEDS`. Nilainya harus berupa JSON array. Setiap feed harus RSS/Atom HTTPS resmi, dengan host yang sama seperti di URL, nama sumber, kategori, dan audience `buyer` dan/atau `seller`. Pilih feed yang entry-nya berisi cover di `media:thumbnail`, `media:content`, `enclosure` gambar, atau tag `<img>` di deskripsi/isi artikel. Contoh bentuk konfigurasi (ganti URL dan semua nilai contoh dengan feed terverifikasi):

   ```json
   [{"url":"https://rss.domain-yang-diverifikasi/feed.xml","host":"rss.domain-yang-diverifikasi","sourceName":"Nama penerbit","category":"Edukasi","audience":["buyer"]}]
   ```

   Contoh ini hanya menunjukkan bentuk JSON, bukan alamat feed yang siap dipakai. Tambahkan feed terverifikasi untuk kedua audience bila diperlukan. Maksimal delapan feed; setiap feed menyumbang sampai delapan artikel berusia paling lama 120 hari. Agar berita otomatis saja berjumlah lima, sumber harus menyediakan setidaknya lima artikel terbaru yang memenuhi filter. Kata kunci opsional dapat ditambahkan sebagai `"keywords":["usaha","pembayaran"]`.
5. Di **Database → Vault**, buat dua secret dengan nama persis `project_url` dan `service_role_key`. Isi `project_url` dengan URL project, misalnya `https://PROJECT_REF_ANDA.supabase.co`, dan `service_role_key` dengan nilai **service_role** dari **Project Settings → API Keys**. Nilai ini harus sama dengan service-role key yang tersedia untuk Edge Function. Jangan memakai anon/publishable key dan jangan menaruh service-role key di aplikasi, chat, atau repository.

6. Tempel isi `supabase/education-weekly-schedule.sql` ke **SQL Editor** lalu jalankan. Jadwalnya setiap Senin pukul 02:00 UTC (09:00 WIB); SQL ini memerlukan secret Vault pada langkah sebelumnya.
7. Untuk uji langsung, buka **Edge Functions → refresh-education → Test**, pilih `POST`, isi body `{}`, dan tambahkan header `Authorization: Bearer <service_role_key>`. Jangan membagikan key tersebut. Respons sukses berbentuk `{"synced":N,"covers":N,"failures":[]}`; `covers` menghitung artikel yang punya URL cover.
8. Periksa job di SQL Editor:

   ```sql
   select jobname, schedule, active
   from cron.job
   where jobname = 'refresh-education-weekly';
   ```

   Setelah jadwal berjalan, buka **Integrations → Cron** atau periksa riwayat job:

   ```sql
   select status, return_message, start_time, end_time
   from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'refresh-education-weekly')
   order by start_time desc
   limit 5;
   ```

   Periksa artikel dan cover yang tersimpan:

   ```sql
   select title, cover_url, source_url, synced_at
   from public.education_articles
   where source_url is not null
   order by synced_at desc
   limit 10;
   ```

   `cron.job_run_details` memastikan Cron berjalan, sedangkan **Edge Functions → refresh-education → Logs** atau hasil uji langsung menunjukkan apakah feed berhasil dibaca. Untuk mengubah sumber, perbarui secret `EDUCATION_FEEDS`; untuk mengubah jadwal, sesuaikan file SQL dan jalankan ulang. Artikel tanpa gambar dari feed tetap dapat tersinkron, tetapi `cover_url` akan kosong. Jangan tempel kode TypeScript Edge Function ke SQL Editor.

## Stack

- React + TypeScript + Vite
- Supabase Auth dan Postgres
- Dashboard penjual, katalog, dan checkout memerlukan Supabase
