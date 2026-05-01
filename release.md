# Arch Radio v1.0.0

Ini adalah rilis stabil pertama Arch Radio. Fokus utama versi ini adalah pemantapan UI/UX, stabilitas *streaming*, dan integrasi penuh dengan sistem operasi Windows.

### Yang Baru di Versi 1.0.0:
- **Desain Glassmorphism**: Antarmuka baru yang lebih bersih dengan efek kaca transparan dan animasi "Vinyl" berputar di bar pemutar.
- **Integrasi Windows Media**: Judul lagu (metadata ICY) dan logo stasiun sekarang muncul secara *real-time* di panel volume/media Windows (SMTC).
- **Custom Context Menu**: Menu klik kanan bawaan browser telah diganti dengan menu kustom aplikasi yang lebih fungsional (Reload, Compact Mode, Settings, Exit).
- **Lokasi Lebih Akurat**: Menggunakan plugin *native geolocation* untuk deteksi kota yang lebih presisi tanpa memunculkan alamat teknis "tauri.localhost".
- **Mode Widget**: Fitur *Compact Mode* yang memungkinkan pemutar radio mengecil dan tetap berada di atas jendela lain (*Always on Top*).
- **Auto-Next & Failover**: Aplikasi akan otomatis mencari stasiun atau *stream* cadangan jika koneksi radio terputus atau gagal dimuat.
- **Audio Tools**: Penambahan fitur *Audio Normalizer* untuk menyeimbangkan volume antar stasiun dan *Sleep Timer*.

### Perbaikan & Optimasi:
- Perbaikan tata letak pemutar yang sempat bergeser saat judul stasiun terlalu panjang.
- Optimasi pengambilan gambar logo lewat jalur *backend* untuk melewati batasan keamanan browser (CORS).
- Perbaikan logika "All Cities" yang sebelumnya sempat kosong karena terfilter oleh jarak GPS.
- Sinkronisasi gambar cadangan (*fallback*) yang kini selalu muncul di panel kontrol sistem meskipun stasiun tidak memiliki logo.

### Cara Instalasi:
1. Unduh file instalasi (`.msi` atau `.exe`) dari folder rilis.
2. Jalankan installer dan ikuti petunjuknya.
3. Aplikasi akan langsung mendeteksi stasiun radio di kota Anda saat pertama kali dibuka.

***

**Arch Radio** – *Radio player* ringan berbasis Tauri untuk Windows.
Dibuat oleh **Khoirul Aksara**.
