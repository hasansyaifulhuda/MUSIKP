# MUSICFY V2 — MANUAL REQUIREMENTS

> Dokumen ini berisi semua konfigurasi, credential, dan tindakan manual yang HARUS dilakukan oleh user/operator.
> AI tidak boleh membuat credential palsu atau melakukan deployment otomatis.

---

## STATUS KEBUTUHAN MANUAL

| # | Kebutuhan | Tahap | Status |
|---|---|---|---|
| 1 | Android Signing Keystore | 5 | PENDING |
| 2 | GitHub Secrets Setup | 5 | PENDING |
| 3 | GitHub Repository & Releases | 5 | PENDING |
| 4 | VPS Deployment | 10 | PENDING |
| 5 | YouTube Cookies (cookies.txt) | Ongoing | PENDING |
| 6 | Environment Variables VPS | 1 | PENDING |

---

## 1. Android Signing Keystore

### Apa ini?
File keystore adalah "tanda tangan digital" untuk APK Android. Setiap APK yang didistribusikan ke pengguna HARUS ditandatangani dengan keystore yang sama. Jika keystore hilang atau diganti, pengguna tidak bisa update APK tanpa uninstall dulu.

### Tindakan yang Diperlukan:
Buat keystore baru (HANYA SEKALI, SIMPAN BAIK-BAIK):

```bash
keytool -genkey -v \
  -keystore musicfy-release-key.jks \
  -alias musicfy-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Isi informasi yang diminta:
- First and Last Name: [Nama kamu]
- Organization: MusicFY
- City: [Kota kamu]
- Country Code: ID

Simpan file musicfy-release-key.jks di tempat yang SANGAT AMAN (bukan di repository!).

### Encode keystore ke Base64:
```bash
base64 -w 0 musicfy-release-key.jks > keystore-base64.txt
```

Nilai dari keystore-base64.txt akan dimasukkan ke GitHub Secrets.

### PERINGATAN:
- Jangan pernah commit file .jks ke repository
- Jangan kehilangan file ini
- Backup ke minimal 2 lokasi terpisah (cloud storage + USB)

---

## 2. GitHub Secrets Setup

### Apa ini?
GitHub Secrets adalah cara aman menyimpan credential sensitif untuk GitHub Actions tanpa mengekspos ke kode.

### Cara Setup:
1. Buka repository di GitHub
2. Settings → Secrets and variables → Actions → New repository secret

### Secrets yang Harus Dibuat:

| Secret Name | Value | Sumber |
|---|---|---|
| KEYSTORE_BASE64 | Output dari base64 encode keystore | Dari langkah 1 |
| KEYSTORE_PASSWORD | Password keystore yang dibuat | Dari langkah 1 |
| KEY_ALIAS | musicfy-key (atau alias yang dipilih) | Dari langkah 1 |
| KEY_PASSWORD | Password key signing | Dari langkah 1 |

Note: GITHUB_TOKEN tersedia otomatis, tidak perlu dibuat manual.

---

## 3. GitHub Repository & Releases

### Apa ini?
APK V2 akan didistribusikan melalui GitHub Releases yang diakses dari halaman /download/ di website.

### Tindakan yang Diperlukan:

#### 3.1 Push repository ke GitHub:
```bash
cd /home/shanz/Downloads/MusicFY-main
git remote add origin https://github.com/USERNAME/REPO_NAME.git
git push -u origin main
git push -u origin musicfy-v2-development
```

Ganti USERNAME dan REPO_NAME dengan username dan nama repository GitHub kamu.

#### 3.2 Update konfigurasi GitHub di kode:
Di file app/api/version/route.ts (akan dibuat di Tahap 6), update:
```
GITHUB_OWNER=USERNAME_GITHUB
GITHUB_REPO=NAMA_REPO
```

#### 3.3 Buat GitHub Release pertama:
Setelah APK signed berhasil di-build:
```bash
git tag v2.0.0
git push origin v2.0.0
```
GitHub Actions akan otomatis membuat release dan mengupload APK.

---

## 4. VPS Deployment

### Prasyarat VPS:
- OS: Ubuntu 20.04+ / Debian 11+
- RAM: minimal 1GB (2GB direkomendasikan)
- Disk: minimal 20GB (untuk audio cache)
- Node.js: 20.x
- yt-dlp: terinstall dan di PATH

### Instalasi yt-dlp di VPS:
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### Deployment Next.js Standalone:
```bash
# Build
cd /path/to/MusicFY
npm install
npm run build

# Jalankan dengan PM2
npm install -g pm2
pm2 start .next/standalone/server.js --name musicfy
pm2 save
pm2 startup
```

### Nginx Configuration:
```nginx
server {
    listen 80;
    server_name shanz.my.id;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL (Let's Encrypt):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d shanz.my.id
```

---

## 5. YouTube Cookies (cookies.txt)

### Apa ini?
File cookies.txt diperlukan agar yt-dlp dapat mengakses konten YouTube yang memerlukan autentikasi atau untuk melewati pembatasan bot.

### Cara Mendapatkan cookies.txt:
1. Install ekstensi browser "Get cookies.txt LOCALLY" (Chrome/Firefox)
2. Login ke YouTube/Google di browser
3. Buka youtube.com
4. Klik ekstensi → Export cookies untuk youtube.com
5. Simpan file sebagai cookies.txt

### Penempatan di VPS:
```bash
cp cookies.txt /path/to/MusicFY/storage/cookies.txt
chmod 600 /path/to/MusicFY/storage/cookies.txt
```

### Pembaruan Berkala:
Cookies YouTube expired setelah beberapa waktu. Perbarui cookies.txt secara berkala (estimasi tiap 1-3 bulan atau ketika ada error "bot detection").

### Monitoring:
Gunakan endpoint /developer di website untuk memeriksa status cookies.

---

## 6. Environment Variables VPS

### File .env yang harus dibuat di VPS:
Buat file .env di direktori root proyek:

```bash
# WAJIB: URL aplikasi
APP_URL=https://shanz.my.id

# OPSIONAL: API Key Gemini (jika fitur AI diaktifkan)
GEMINI_API_KEY=your_gemini_api_key_here

# OPSIONAL: Ukuran maksimal audio cache (default: 10 GB)
AUDIO_CACHE_MAX_GB=10

# OPSIONAL: Timeout download audio (ms, 0 = unlimited)
AUDIO_DOWNLOAD_TIMEOUT_MS=120000

# OPSIONAL: GitHub info untuk /api/version dan /download/
GITHUB_OWNER=your_github_username
GITHUB_REPO=your_repo_name
GITHUB_TOKEN=your_github_personal_access_token

# OPSIONAL: Port (default: 3000)
PORT=3000
```

### GitHub Personal Access Token:
Diperlukan untuk fetch GitHub Releases API (menghindari rate limit).
Buat di: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
Scope yang diperlukan: public_repo (read-only cukup)

---

## 7. Ringkasan Aksi yang Harus Dilakukan User

### Sebelum Tahap 5 (APK Release):
- [ ] Buat Android Signing Keystore (keytool)
- [ ] Simpan keystore di tempat aman
- [ ] Setup GitHub Secrets (4 secrets)
- [ ] Push repository ke GitHub
- [ ] Update GITHUB_OWNER dan GITHUB_REPO di konfigurasi

### Sebelum/Saat Deployment:
- [ ] Siapkan VPS dengan spesifikasi minimal
- [ ] Install yt-dlp di VPS
- [ ] Buat file .env dengan environment variables
- [ ] Dapatkan dan tempatkan cookies.txt
- [ ] Setup Nginx reverse proxy
- [ ] Setup SSL dengan Let's Encrypt

### Setelah Deployment:
- [ ] Test semua endpoint API
- [ ] Verifikasi audio streaming berjalan
- [ ] Test APK download dari /download/
- [ ] Monitor disk usage (audio cache)
- [ ] Setup cron job untuk rotasi cookies.txt jika diperlukan

---

## 8. Catatan Keamanan

- Jangan pernah commit secrets ke repository
- File .env HARUS ada di .gitignore
- File cookies.txt HARUS ada di .gitignore
- File keystore (.jks) HARUS ada di .gitignore
- GitHub Secrets dienkripsi oleh GitHub, aman untuk digunakan
- Gunakan HTTPS (SSL) untuk semua traffic produksi
- Rate limiting sudah diimplementasikan di API (lib/rateLimit.ts)

---

## 9. Kontak Support

Jika ada pertanyaan tentang implementasi V2:
- Buka issue di GitHub repository
- Dokumentasi teknis: MUSICFY_V2_ARCHITECTURE.md
- Rencana implementasi: MUSICFY_V2_IMPLEMENTATION_PLAN.md
