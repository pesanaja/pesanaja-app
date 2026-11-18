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

Untuk project baru, terapkan **semua** file `.sql` di `supabase/migrations` melalui SQL Editor, satu per satu menurut urutan timestamp pada nama file; jangan melewati migration perantara. Pada project yang sudah berisi data, periksa dahulu migration mana yang sudah diterapkan agar tidak mengulang perubahan secara manual. Tiga migration paling baru adalah `20261118190000_finance_installments.sql`, `20261118193000_expand_monetary_range_and_sync_batch_prices.sql`, dan `20261118200000_qris_variants_and_order_receipt.sql`; semuanya bergantung pada schema dan fitur checkout sebelumnya. Migration terakhir menambahkan foto QRIS toko, konfirmasi penerimaan pesanan, validasi metode bayar di database, dan pemesanan beberapa varian. Migration finance memperluas nominal uang dan menyinkronkan harga produk ke batch yang masih terbuka. Produk tampil hanya jika toko terverifikasi, produknya aktif, dan produk dimasukkan ke batch terbuka. Foto produk di katalog berasal dari foto yang diunggah penjual. Checkout menyimpan pesanan dan bukti pembayaran di Supabase Storage.

## Edukasi mingguan

Artikel RSS/Atom disimpan di `education_articles` dan ditampilkan sesuai audience. Halaman edukasi menampilkan minimal lima bacaan dengan memadukan artikel terbaru dan panduan pilihan bila artikel sinkron belum mencapai lima.

### Konfigurasi pembaruan mingguan

1. Pastikan project Supabase yang benar sudah dipilih. Terapkan migration `20261116180000_automated_education.sql` melalui **SQL Editor** atau dengan Supabase CLI.
2. Pada **Database → Extensions**, aktifkan `pg_cron` dan `pg_net` jika belum aktif.
3. Hubungkan folder project ke Supabase CLI satu kali, lalu deploy fungsi. Ganti `PROJECT_REF_ANDA` dengan Project ID dari halaman **Project Settings → General**:

   ```sh
   npx supabase link --project-ref PROJECT_REF_ANDA
   npx supabase functions deploy refresh-education
   ```

4. Di **Edge Functions → Secrets**, tambahkan secret bernama `EDUCATION_FEEDS`. Nilainya harus berupa JSON array. Setiap feed harus RSS/Atom HTTPS resmi, dengan host yang sama seperti di URL, nama sumber, kategori, dan audience `buyer` dan/atau `seller`. Ganti seluruh contoh di bawah dengan feed yang sudah dipastikan benar-benar tersedia:

   ```json
   [{"url":"https://rss.domain-yang-diverifikasi/feed.xml","host":"rss.domain-yang-diverifikasi","sourceName":"Nama penerbit","category":"Edukasi","audience":["buyer"]}]
   ```

   Contoh ini hanya menunjukkan bentuk JSON, bukan alamat feed yang siap dipakai. Tambahkan feed terverifikasi untuk kedua audience bila diperlukan. Maksimal delapan feed; setiap feed menyumbang sampai delapan artikel berusia paling lama 120 hari. Agar berita otomatis saja berjumlah lima, sumber harus menyediakan setidaknya lima artikel terbaru yang memenuhi filter. Kata kunci opsional dapat ditambahkan sebagai `"keywords":["usaha","pembayaran"]`.
5. Di **Database → Vault**, buat dua secret dengan nama persis `project_url` dan `service_role_key`. Isi `project_url` dengan URL project, misalnya `https://PROJECT_REF_ANDA.supabase.co`, dan `service_role_key` dengan secret key server dari pengaturan API project. Jangan menaruh service-role key pada aplikasi atau repository.

6. Tempel isi `supabase/education-weekly-schedule.sql` ke **SQL Editor** lalu jalankan. Jadwalnya setiap Senin pukul 02:00 UTC (09:00 WIB); SQL ini memerlukan secret Vault pada langkah sebelumnya.
7. Periksa job di SQL Editor:

   ```sql
   select jobname, schedule, active
   from cron.job
   where jobname = 'refresh-education-weekly';
   ```

   Setelah jadwal berjalan, pantau hasilnya melalui **Edge Functions → refresh-education → Logs**. Untuk mengubah sumber, perbarui secret `EDUCATION_FEEDS`; untuk mengubah jadwal, sesuaikan file SQL dan jalankan ulang. Jangan tempel kode TypeScript Edge Function ke SQL Editor.

## Stack

- React + TypeScript + Vite
- Supabase Auth dan Postgres
- Dashboard penjual, katalog, dan checkout memerlukan Supabase
