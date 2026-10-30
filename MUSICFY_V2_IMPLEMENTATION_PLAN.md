# MUSICFY V2 — IMPLEMENTATION PLAN (10 TAHAP)

> **Branch:** `musicfy-v2-development`
> **Tanggal Rencana:** 2026-10-30
> **Domain:** https://shanz.my.id
> **App ID:** com.musicfy.app

---

## Ringkasan Eksekusi

Semua tahap dikerjakan secara berurutan. Tidak ada penghapusan fitur yang sudah ada. Setiap tahap divalidasi sebelum melanjutkan ke tahap berikutnya.

---

## TAHAP 1 — AI Onboarding & Project Initialization ✅ SELESAI

**Status:** DONE
**Durasi estimasi:** 1 jam

### Checklist:
- [x] Audit seluruh struktur repository
- [x] Baca README, package.json, next.config.ts, capacitor.config.ts, AndroidManifest.xml
- [x] Baca semua workflow GitHub Actions
- [x] Identifikasi seluruh fitur yang sudah berjalan (23 fitur)
- [x] Identifikasi potensi konflik dan risiko
- [x] Init git repository (project belum ada .git)
- [x] Buat commit awal snapshot V1
- [x] Buat branch musicfy-v2-development
- [x] Buat MUSICFY_V2_ARCHITECTURE.md
- [x] Buat MUSICFY_V2_IMPLEMENTATION_PLAN.md
- [x] Buat MUSICFY_V2_MANUAL_REQUIREMENTS.md

### Temuan Audit:
- Project menggunakan Next.js 15 App Router + Capacitor 8
- Android sudah memiliki MediaSession + ForegroundService (manual, tanpa Media3)
- Audio engine Android masih HTML5 melalui WebView (belum native ExoPlayer)
- GitHub Actions build-apk.yml hanya build debug, tidak ada GitHub Releases
- Tidak ada /api/version endpoint
- git repo belum ada (diinisialisasi di Tahap 1)
- Dua versi build-apk.yml: di root dan di .github/workflows/ (potensi konflik)

---

## TAHAP 2 — Media3 ExoPlayer Android Integration

**Status:** PENDING
**Estimasi:** 4-6 jam
**Dependencies:** Tahap 1 selesai

### Tujuan:
Integrasi AndroidX Media3 ExoPlayer sebagai native audio engine untuk Android APK, menggantikan HTML5 Audio melalui WebView untuk playback di Android.

### Pekerjaan:

#### 2.1 Update android/app/build.gradle
- Tambah dependencies Media3: exoplayer, session, ui, common (versi 1.4.1)
- Pastikan minSdkVersion kompatibel (23 sudah oke)

#### 2.2 Buat MusicPlaybackService.java
- Extends MediaSessionService (Media3)
- Inisialisasi ExoPlayer di onCreate
- Setup MediaSession (Media3)
- Setup DefaultMediaNotificationProvider
- Handle Play/Pause/Next/Previous actions
- Background playback dengan WakeLock

#### 2.3 Buat ExoPlayerManager.java
- Singleton ExoPlayer lifecycle manager
- Audio focus handling (AudioManager.OnAudioFocusChangeListener)
- setMediaItem() dan prepare() untuk URL streaming
- Listener untuk playback state changes
- Error handling dan retry logic

#### 2.4 Buat ExoPlayerBridge.java
- JavascriptInterface untuk komunikasi WebView <-> ExoPlayer
- Method: play(url, title, artist, thumbnailUrl)
- Method: pause(), resume(), stop()
- Method: seekTo(positionMs)
- Method: setVolume(level)
- Callback ke WebView saat state berubah (via evaluateJavascript)

#### 2.5 Update MainActivity.java
- Register ExoPlayerBridge sebagai JavascriptInterface
- Bind ke MusicPlaybackService
- Handle lifecycle (onStart, onStop, onDestroy)

#### 2.6 Update AndroidManifest.xml
- Daftarkan MusicPlaybackService dengan mediaPlayback foregroundServiceType
- Tambah intent-filter untuk MediaButtonReceiver
- AudioForegroundService tetap ada sebagai fallback

#### 2.7 Update MusicBackgroundPlugin.java
- Tambah method untuk kontrol ExoPlayer via Capacitor

### Risiko:
- MEDIUM: Koordinasi state antara WebView Player.tsx dan native ExoPlayer
- LOW: Audio focus conflict antara HTML5 Audio dan ExoPlayer jika keduanya aktif bersamaan
- MITIGATION: Deteksi platform di Player.tsx, matikan HTML5 Audio ketika ExoPlayer aktif

### Validasi:
- APK bisa di-build tanpa error
- Audio bisa diputar melalui ExoPlayer pada emulator/device Android
- Notifikasi media muncul dengan kontrol Play/Pause/Next/Prev
- Background playback berjalan ketika app diminimize
- Lock screen controls berfungsi

---

## TAHAP 3 — JavaScript-Native Audio Bridge

**Status:** PENDING
**Estimasi:** 3-4 jam
**Dependencies:** Tahap 2 selesai

### Tujuan:
Hubungkan Player.tsx (WebView) dengan ExoPlayer native melalui bridge yang bersih. Platform detection otomatis memilih engine yang tepat.

### Pekerjaan:

#### 3.1 Update lib/platform.ts
- Tambah deteksi eksplisit untuk ExoPlayer availability
- Expose isExoPlayerAvailable() function

#### 3.2 Buat lib/exoPlayerBridge.ts
- TypeScript wrapper untuk window.ExoPlayerBridge
- Interface: ExoPlayerCommand { play, pause, resume, stop, seekTo, setVolume }
- Type-safe calls ke native bridge
- Fallback graceful ke HTML5 Audio jika bridge tidak tersedia

#### 3.3 Update lib/audioElement.ts
- Deteksi platform di awal
- Jika Android APK + ExoPlayer tersedia: delegate ke exoPlayerBridge.ts
- Jika Web/PWA: tetap gunakan HTML5 Audio (tidak berubah)
- Handle callback dari ExoPlayer (onStateChange, onError, onProgress)

#### 3.4 Update components/Player.tsx
- Terima state update dari ExoPlayer (posisi, durasi, buffering)
- Kirim perintah ke ExoPlayer melalui exoPlayerBridge.ts
- UI tetap identik (tidak ada perubahan tampilan)

#### 3.5 Update lib/backgroundService.ts
- Integrasi dengan ExoPlayerBridge untuk foreground service
- Fallback ke AudioForegroundService jika ExoPlayer tidak tersedia

### Validasi:
- Web/PWA: playback tidak berubah (HTML5 Audio)
- Android APK: playback melalui ExoPlayer native
- State sinkron antara UI dan audio engine
- No console errors di kedua platform

---

## TAHAP 4 — Media Notification & Lock Screen (Media3)

**Status:** PENDING
**Estimasi:** 2-3 jam
**Dependencies:** Tahap 3 selesai

### Tujuan:
Implementasi notifikasi media dan kontrol lock screen menggunakan Media3 yang proper, menggantikan implementasi manual di MediaSessionBridge.java.

### Pekerjaan:

#### 4.1 Setup DefaultMediaNotificationProvider di MusicPlaybackService
- Konfigurasi tampilan notifikasi (album art, judul, artis)
- Button: Previous, Play/Pause, Next
- Swipe-to-dismiss behavior (hanya saat paused)

#### 4.2 Update MediaSession (Media3)
- setMetadata() dengan title, artist, album, duration, artwork bitmap
- setPlaybackState() sinkron dengan ExoPlayer state
- Handle media button events

#### 4.3 Artwork Loading
- Download thumbnail dari URL di background thread
- Cache bitmap di memory
- Update notification saat artwork berhasil diload

#### 4.4 Audio Focus Integration
- Implement AudioManager.OnAudioFocusChangeListener di ExoPlayerManager
- Pause ketika fokus hilang (telepon masuk, notifikasi suara)
- Resume ketika fokus kembali

#### 4.5 Lock Screen Controls
- Pastikan MediaSession.setActive(true) dipanggil saat playing
- Verifikasi di berbagai Android versi (API 23-35)

### Validasi:
- Notifikasi media muncul saat musik diputar
- Album art ditampilkan di notifikasi
- Kontrol Play/Pause/Next/Prev berfungsi dari notifikasi
- Lock screen controls berfungsi
- Audio pause saat telepon masuk

---

## TAHAP 5 — GitHub Actions Release Pipeline

**Status:** PENDING
**Estimasi:** 2-3 jam
**Dependencies:** Tahap 1 selesai (bisa paralel dengan 2-4)

### Tujuan:
Setup automated release pipeline yang menghasilkan signed APK dan mendistribusikannya via GitHub Releases.

### Pekerjaan:

#### 5.1 Buat .github/workflows/build-apk-release.yml
- Trigger: push tag v* (misalnya v2.0.0)
- Build signed Release APK
- Upload ke GitHub Releases dengan release notes
- Hapus duplikat build-apk.yml di root (pindah ke .github/workflows/)

#### 5.2 Konfigurasi Android Release Build
- Update android/app/build.gradle untuk signingConfigs release
- Baca keystore dari GitHub Secrets (placeholder, keystore manual)
- assembleRelease dengan APK naming convention

#### 5.3 GitHub Secrets yang Dibutuhkan (MANUAL - Tahap 10)
- KEYSTORE_BASE64: Keystore file encoded base64
- KEYSTORE_PASSWORD: Password keystore
- KEY_ALIAS: Alias key signing
- KEY_PASSWORD: Password key
- GITHUB_TOKEN: Otomatis tersedia

#### 5.4 Update .github/workflows/build-apk.yml
- Pertahankan untuk debug build pada push ke main
- Tidak ada breaking changes

### Validasi:
- Workflow syntax valid (yaml lint)
- Debug build tetap berjalan pada push main
- Release workflow terdefinisi dengan benar (akan aktif setelah keystore tersedia)

---

## TAHAP 6 — API Version Endpoint & APK Download Page

**Status:** PENDING
**Estimasi:** 2-3 jam
**Dependencies:** Tahap 5 selesai

### Tujuan:
Tambah endpoint /api/version dan halaman /download/ untuk distribusi APK yang proper.

### Pekerjaan:

#### 6.1 Buat app/api/version/route.ts
- GET /api/version
- Response JSON:
  - version: string (misalnya "2.0.0")
  - apkVersion: string
  - apkDownloadUrl: string (URL GitHub Releases terbaru)
  - changelog: string[]
  - minAndroidVersion: number (23)
  - buildDate: string

#### 6.2 Buat halaman /download/ yang baru (menggantikan /install-apk)
- Fetch dari GitHub Releases API untuk mendapatkan APK terbaru
- Tampilkan versi terbaru dengan changelog
- Button download APK (link langsung ke GitHub Releases)
- Instruksi instalasi
- QR code untuk download mudah dari mobile
- UI modern, konsisten dengan design MusicFY

#### 6.3 Update capacitor.config.ts
- webDir tetap 'public' (tidak berubah)
- server URL tetap https://shanz.my.id (tidak berubah)

#### 6.4 Tambah metadata versi di package.json
- Bump version ke "2.0.0"

### Validasi:
- GET /api/version mengembalikan JSON valid
- Halaman /download/ dapat diakses
- Link ke GitHub Releases berfungsi (setelah release dibuat)

---

## TAHAP 7 — PWA Enhancement & Offline Improvements

**Status:** PENDING
**Estimasi:** 2-3 jam
**Dependencies:** Tahap 6 selesai

### Tujuan:
Tingkatkan pengalaman PWA dan offline playback, termasuk update Service Worker.

### Pekerjaan:

#### 7.1 Update public/sw.js
- Cache strategy untuk static assets
- Cache /api/version response (max 1 jam)
- Background sync untuk queue yang dibuat offline

#### 7.2 Improvement Offline Library
- Better error states ketika offline
- Indicator jumlah lagu yang tersimpan offline
- Estimasi ruang penyimpanan yang digunakan

#### 7.3 Update public/manifest.json
- Tambah screenshot untuk PWA install prompt
- Update version
- Tambah categories

#### 7.4 PWA Update Notification
- Deteksi service worker update
- Tampilkan notifikasi "Update tersedia"
- Tombol "Perbarui sekarang"

### Validasi:
- PWA tetap bisa diinstall
- Offline library berfungsi normal
- Service Worker tidak memblokir update

---

## TAHAP 8 — Performance & Security Hardening

**Status:** PENDING
**Estimasi:** 3-4 jam
**Dependencies:** Tahap 7 selesai

### Tujuan:
Optimasi performa, keamanan API, dan kualitas kode.

### Pekerjaan:

#### 8.1 Security Headers
- Update next.config.ts dengan CSP headers
- Tambah X-Content-Type-Options, X-Frame-Options
- Rate limiting lebih ketat untuk /api/stream

#### 8.2 Performance Optimizations
- Lazy loading komponen besar (EqualizerModal, FullScreenLyrics)
- Image optimization untuk thumbnail
- Prefetch strategi yang lebih cerdas

#### 8.3 Audio Quality Options
- Tambah pilihan kualitas: auto, low (128K), normal (192K), high (320K)
- Simpan preferensi di localStorage/IndexedDB

#### 8.4 Error Tracking
- Better error boundaries
- Self-diagnosis yang lebih informatif (lib/selfDiagnosis.ts)

#### 8.5 Android Performance
- ExoPlayer buffer configuration tuning
- Memory management improvements
- Reduce WebView memory footprint

### Validasi:
- Lighthouse score 90+ (PWA)
- Tidak ada memory leak yang terdeteksi
- API response time < 500ms untuk cached content

---

## TAHAP 9 — Testing & Quality Assurance

**Status:** PENDING
**Estimasi:** 3-4 jam
**Dependencies:** Tahap 8 selesai

### Tujuan:
Verifikasi seluruh fitur berjalan dengan benar di kedua platform.

### Pekerjaan:

#### 9.1 Web/PWA Testing Checklist
- [ ] Streaming audio berjalan
- [ ] Download offline berjalan
- [ ] Search berfungsi
- [ ] Lyrics tersinkronisasi
- [ ] Equalizer berfungsi
- [ ] PWA installable
- [ ] Offline playback dari IndexedDB

#### 9.2 Android APK Testing Checklist
- [ ] APK dapat di-build dan diinstall
- [ ] Streaming melalui ExoPlayer
- [ ] Notifikasi media muncul
- [ ] Background playback berjalan
- [ ] Lock screen controls berfungsi
- [ ] Audio pause saat telepon masuk
- [ ] Battery optimization tidak membunuh app

#### 9.3 API Endpoint Testing
- [ ] /api/stream berfungsi
- [ ] /api/download berfungsi
- [ ] /api/version berfungsi
- [ ] /api/search berfungsi
- [ ] Rate limiting berfungsi
- [ ] Cache headers benar

#### 9.4 Cross-Browser Testing
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari (jika tersedia)

### Validasi:
- Semua checklist lulus
- Tidak ada regresi dari fitur V1

---

## TAHAP 10 — Documentation & Deployment Preparation

**Status:** PENDING
**Estimasi:** 1-2 jam
**Dependencies:** Tahap 9 selesai

### Tujuan:
Finalisasi dokumentasi, persiapan deployment, dan handoff ke user untuk langkah manual.

### Pekerjaan:

#### 10.1 Update MUSICFY_V2_MANUAL_REQUIREMENTS.md
- Daftar final semua langkah manual yang diperlukan
- Panduan deployment ke VPS
- Panduan setup GitHub Secrets untuk APK signing
- Panduan membuat GitHub Release pertama

#### 10.2 Buat CHANGELOG.md
- Semua perubahan V1 → V2
- Breaking changes (jika ada)

#### 10.3 Update README (jika ada)
- Instruksi setup development
- Instruksi deployment
- Instruksi build APK

#### 10.4 Pre-deployment Checklist
- [ ] Semua environment variables terdokumentasi
- [ ] .env.example diperbarui
- [ ] GitHub Secrets terdokumentasi
- [ ] VPS requirements terdokumentasi
- [ ] Instruksi deployment terdokumentasi

---

## Timeline Estimasi

| Tahap | Nama | Estimasi |
|---|---|---|
| 1 | AI Onboarding & Init | 1 jam (SELESAI) |
| 2 | Media3 ExoPlayer Android | 4-6 jam |
| 3 | JS-Native Audio Bridge | 3-4 jam |
| 4 | Media Notification & Lock Screen | 2-3 jam |
| 5 | GitHub Actions Release Pipeline | 2-3 jam |
| 6 | API Version & Download Page | 2-3 jam |
| 7 | PWA Enhancement | 2-3 jam |
| 8 | Performance & Security | 3-4 jam |
| 9 | Testing & QA | 3-4 jam |
| 10 | Documentation & Deployment Prep | 1-2 jam |
| **Total** | | **23-33 jam** |

---

## Dependency Graph Tahap

```
1 (DONE) ──┬──> 2 ──> 3 ──> 4 ──> 9 ──> 10
           └──> 5 ──> 6 ──> 7 ──> 8 ──┘
```

Tahap 2,3,4 dan 5,6,7,8 bisa dikerjakan paralel setelah Tahap 1 selesai.
