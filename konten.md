# Arch Radio: Karena Ada Memori yang Gak Bisa Diganti Sama Algoritma

Jujur aja, ide bikin **Arch Radio** ini muncul dari rasa rindu. Saya inget banget jaman kuliah dulu, waktu begadang ngerjain tugas kampus yang gak habis-habis, satu-satunya temen yang setia ya suara penyiar radio di tengah malem. Ada rasa tenang yang beda kalau dengerin lagu yang diputerin orang, bukan sekadar *shuffle* dari algoritma yang kadang kerasa "dingin".

Masalahnya, sekarang cari aplikasi radio desktop yang enak dipandang dan gak bikin laptop lemot itu susahnya minta ampun. Kebanyakan aplikasi sekarang berat banget cuma buat muter *stream* suara. Akhirnya saya putusin buat bikin sendiri: aplikasi radio yang bawa *vibe* nostalgia itu ke masa kini, tapi tetep pake teknologi modern yang kenceng.

---

## Membawa Vibe Nostalgia ke Teknologi Modern

Saya membangun Arch Radio dengan satu misi: aplikasinya harus secanggih jaman sekarang, tapi fungsinya tetep fokus ke esensi radio itu sendiri. Saya pake **Tauri v2** dan **Rust** biar performanya gak "rewel" dan gak makan RAM gila-gilaan kayak aplikasi berbasis browser pada umumnya.

### Apa yang bikin Arch Radio spesial (buat saya)?

*   **Tampilan Glassmorphism**: Saya pengen aplikasi ini kelihatan estetik di desktop. Efek transparansi dan blur-nya saya poles biar pas di mata—modern tapi tetep minimalis, gak ganggu fokus pas lagi kerja (atau ngerjain tugas!).
*   **Fitur "Smart Last Play"**: Saya paling males kalau harus nyari lagi tadi dengerin stasiun apa. Begitu Arch Radio dibuka, stasiun terakhir langsung *standby*. Tinggal satu klik, langsung lanjut.
*   **Mode Widget (Compact)**: Kadang kita cuma butuh liat judul lagu sambil fokus ngetik. Mode ini bikin aplikasi jadi kecil di pojok layar, informatif tapi tetep *low profile*.
*   **Update Tanpa Drama**: Kita semua benci pop-up update yang tiba-tiba muncul. Makanya saya buat sistem badge bintang kuning di menu settings. Dia bakal kasih tau kalau ada versi baru secara halus, tanpa bikin musik berhenti berputar.
*   **Auto-Reconnect**: Kalau internet lagi naik-turun, aplikasi ini gak bakal nyerah. Dia bakal coba konek ulang secara otomatis di balik layar.

---

## Kenapa Harus Rust & Tauri? (Buat yang Suka Ngulik)

Pilihan pake **Rust** itu krusial. Saya pengen aplikasi yang stabil dan aman. Dengan Tauri v2, saya bisa bikin aplikasi yang ukurannya cuma beberapa megabyte tapi punya integrasi penuh ke OS, kayak *Media Session* (judul lagu bakal muncul di notifikasi sistem atau keyboard shortcut Anda).

---

## Penutup

Arch Radio ini adalah proyek personal yang saya kerjakan buat diri saya sendiri, dan mungkin buat kalian yang juga kangen masa-masa ditemani radio pas lagi sibuk-sibuknya kuliah dulu.

Kalau kalian penasaran mau coba atau pengen ikut ngembangin kodenya, mampir aja ke GitHub. Masukan dari kalian sangat berarti buat bikin aplikasi ini jadi lebih solid.

**Arch Radio - Codename Archangel.**  
*Membawa kembali teman begadang Anda ke masa kini.*

---
*Cek proyeknya di sini: [GitHub Arch Radio](https://github.com/khoirulaksara/archradio)*
