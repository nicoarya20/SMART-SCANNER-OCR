# Smart Scanner VIN Toyota

Web-app mobile-first untuk membantu membaca nomor rangka 17 karakter dari foto STNK atau BPKB sebelum pengguna meneruskan pengecekan ke SSC Toyota.

## Alur

1. Buka kamera atau unggah foto dokumen.
2. Jalankan OCR untuk mencari kandidat VIN.
3. Periksa dan koreksi VIN secara manual.
4. Salin VIN dan buka situs SSC Toyota.
5. Pengguna menempel VIN, mengisi email, menyelesaikan CAPTCHA, lalu menekan **Search** pada situs SSC.

> Web-app ini tidak mengirim foto, VIN, atau email ke server sendiri. OCR diproses di browser. Mesin dan data bahasa OCR akan diambil ketika pertama kali digunakan.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Kamera biasanya diizinkan pada `localhost`; untuk perangkat lain dan produksi, gunakan HTTPS.

## Pemeriksaan

```bash
npm test
npm run build
```

## Batasan integrasi SSC

SSC Toyota berada pada domain berbeda dan meminta CAPTCHA. Karena itu web-app ini tidak dapat mengisi atau mengirim form SSC secara otomatis. Tombol terakhir menyalin VIN lalu membuka SSC Toyota agar pengguna menyelesaikan proses resmi tersebut sendiri.
