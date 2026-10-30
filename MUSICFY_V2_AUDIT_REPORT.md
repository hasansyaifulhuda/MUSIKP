# MUSICFY V2 — TAHAP 2: PROJECT AUDIT & PREPARATION REPORT

> **Dokumen:** Laporan Audit Menyeluruh & Persiapan Arsitektur V2  
> **Tanggal Pelaksanaan:** 2026-10-30  
> **Branch Git:** `musicfy-v2-development`  
> **Tahap:** TAHAP 2 (Selesai)  
> **Auditor/Engineer:** Lead Full-Stack, Android, & DevOps Engineer  

---

## 1. RINGKASAN EKSEKUTIF

Audit menyeluruh (comprehensive audit) dan persiapan sistem (project preparation) telah selesai dilakukan untuk seluruh stack proyek **MusicFY V2**, mencakup:
1. **Frontend**: Next.js App Router, React 19, Zustand stores, custom hooks, dan komponen pemutar.
2. **Android Native**: Java bridge, `MediaSession` legacy, `AudioForegroundService`, Capacitor plugins, serta `AndroidManifest.xml`.
3. **Backend API**: 11 route handlers di Next.js server runtime, streaming proxy, disk cache, cookie pool, dan rate limiting.
4. **Capacitor Integration**: Plugin bridging, `server.url` remote architecture vs `webDir`, dan lifecycle WebView.
5. **Gradle & Build System**: AGP 8.7.2, Gradle Wrapper 8.11.1, Java 21, ProGuard/R8, dan dependensi AndroidX.
6. **CI/CD & GitHub Actions**: Workflow build APK, eliminasi duplikasi konfigurasi, dan verifikasi pipeline.

Semua pekerjaan Tahap 1 dipertahankan secara utuh. Tidak ada kode atau fitur yang dihapus atau dirusak.

---

## 2. AUDIT FRONTEND (Next.js & Web Platform)

### 2.1 Dependensi & Versi Aktual Terinstall

| Package | Versi di `package.json` | Versi Terpasang (`node_modules`) | Status Evaluasi |
|---|---|---|---|
| `next` | `^15.4.9` | `15.5.28` | Stabil (App Router aktif, Turbopack compatible) |
| `react` | `^19.2.1` | `19.3.1` | Stabil (React 19 Server/Client Components) |
| `react-dom` | `^19.2.1` | `19.3.1` | Stabil |
| `typescript` | `5.9.3` | `5.9.3` | Valid (Strict type checking lolos) |
| `@capacitor/core` | `^8.6.0` | `8.6.0` | Runtime Android Capacitor V8 |
| `@capacitor/android` | `^8.6.0` | `8.6.0` | Android bridge library |
| `@capacitor/cli` | `^7.6.10` | `7.6.10` | CLI tool kompatibel |

### 2.2 Hasil Uji Kompilasi (`npm run build`)
- **Status:** **SUKSES (Exit Code 0)**
- **Waktu build:** 41 detik
- **Linting & Type-Checking:** Lolos tanpa error TypeScript
- **Output:** 14 static pages ter-prerender, 10 dynamic routes terkonfigurasi
- **Ukuran JS Bersama:** 103 kB First Load JS

### 2.3 Komponen Kritis & Arsitektur Audio Frontend

#### A. `context/MusicContext.tsx` (1.917 baris) — Core Audio Orchestrator
- **State Management:** Mengelola `currentTrack`, `isPlaying`, `queue`, `playbackMode`, volume, equalizer, dan sleep timer.
- **Android Media Bridge Hook (Lines 1571–1593):**
  - Mengirim metadata (`title`, `artist`, `album`, `thumbnailUrl`, `dominantColor`) ke `window.AndroidMediaBridge.updateMetadata()` atau `updateMetadataWithColor()`.
  - Mengirim status playback ke `window.AndroidMediaBridge.updatePlaybackState()`.
- **Android Action Listener (Lines 1228–1265):**
  - Mendefinisikan global function `window.__handleAndroidMediaAction(action, param)` untuk menerima event Play, Pause, Next, Prev, SeekTo, DuckVolume, RestoreVolume dari native Java notification/lockscreen.
- **Visibility & Background Playback:**
  - `startBackgroundAudio()` / `stopBackgroundAudio()` berkoordinasi dengan native foreground service.
  - Secara eksplisit **tidak** menghentikan audio saat event `visibilitychange` (latar belakang aktif).

#### B. `lib/audioElement.ts` (260 baris) — Audio Element Controller
- Saat ini membungkus instans `HTMLAudioElement` tunggal di WebView.
- Dilengkapi penanganan `error`, `stalled`, `waiting`, buffer progress, dan volume control.
- **Poin Kesiapan V2:** File ini akan menjadi titik percabangan (switch/delegate) di Tahap berikutnya: jika berjalan di lingkungan Android APK dengan native Media3, panggilan playback didelegasikan ke native bridge; jika di Web/PWA, tetap menggunakan HTML5 Audio.

#### C. `components/Player.tsx` (1.630 baris) — Full Player UI
- UI responsif, scrubber bar (`PlayerScrubber.tsx`), audio visualizer (`AudioVisualizer.tsx`), preset drawer (`AudioPresetDrawer.tsx`), dan equalizer modal.
- Bebas dependensi langsung ke native API (seluruh interaksi melalui context dan custom store).

#### D. Lirik & DSP
- Worker lirik terisolasi di `public/workers/lyricsWorker.js` dan dikontrol via `lib/lyricsWorkerClient.ts`.
- Equalizer Web Audio API di `lib/audioEffects.ts` (10-band biquad filters).

---

## 3. AUDIT ANDROID NATIVE & JAVA BRIDGES

### 3.1 Spesifikasi Gradle & SDK

| Konfigurasi | Nilai | Evaluasi |
|---|---|---|
| `compileSdkVersion` | `35` (Android 15) | Sesuai target modern Google Play |
| `targetSdkVersion` | `35` | Memerlukan kepatuhan API 35 (Foreground Service types) |
| `minSdkVersion` | `23` (Android 6.0 Marshmallow) | Kompatibel dengan AndroidX Media3 (minSdk 21+) |
| `sourceCompatibility` | `JavaVersion.VERSION_21` | Modern Java bytecode |
| `targetCompatibility` | `JavaVersion.VERSION_21` | Sesuai dengan JDK 21 di CI |
| Android Gradle Plugin | `8.7.2` | Kompatibel penuh dengan Gradle 8.11.1 |
| Gradle Wrapper | `8.11.1` | Stabil |

### 3.2 Audit File Java Eksisting

#### A. `MainActivity.java` (134 baris)
- Menurunkan `BridgeActivity` (Capacitor).
- Mengonfigurasi WebView:
  - `setMediaPlaybackRequiresUserGesture(false)`: Wajib agar audio dapat diputar tanpa interaksi manual di background.
  - `setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, true)`: Melindungi WebView renderer dari kill oleh Low Memory Killer (LMK).
  - Inisialisasi `MediaSessionBridge` dan mendaftarkannya sebagai JavascriptInterface `"AndroidMediaBridge"`.
  - Panggilan `resumeTimers()` saat `onPause()`, `onStop()`, dan `onResume()` sengaja dipertahankan agar timer JavaScript tidak dibekukan sistem saat app berjalan di latar belakang.

#### B. `MediaSessionBridge.java` (699 baris) — Legacy Architecture
- **Temuan Kritis:**
  1. Masih menggunakan package SDK bawaan `android.media.session.MediaSession` dan `android.app.Notification.MediaStyle` (legacy).
  2. Mulai Android 14/15 (API 34/35), `android.media.session.MediaSession` manual rentan terhadap strict background execution limits jika tidak diintegrasikan dengan `MediaSessionService`.
  3. `MediaSession.FLAG_HANDLES_MEDIA_BUTTONS` (line 268) sudah deprecated sejak API 26.
  4. Pengunduhan artwork bitmap dilakukan pada worker thread tanpa disk/memory caching (setiap pergantian lagu mengunduh ulang).
  5. Audio engine sebenarnya masih berjalan di dalam WebView via HTML5 Audio, bukan di native OS.

#### C. `AudioForegroundService.java` (206 baris)
- Menggunakan `android.app.Service` biasa (bukan `MediaSessionService`).
- Menjalankan `startForeground()` dengan flag `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK` (kepatuhan Android 10+).
- Mengakuisisi `PowerManager.PARTIAL_WAKE_LOCK` dengan timeout 12 jam.
- Terdapat properti `android:stopWithTask="true"` pada deklarasi manifest.

#### D. `MusicBackgroundPlugin.java` (91 baris)
- Plugin Capacitor (`@CapacitorPlugin(name = "MusicBackgroundService")`).
- Menyediakan method bridge Capacitor:
  - `startForegroundService()`
  - `stopForegroundService()`
  - `isIgnoringBatteryOptimizations()`
  - `requestIgnoreBatteryOptimizations()`

### 3.3 Audit `AndroidManifest.xml`
- **Izin Lengkap:**
  - `android.permission.INTERNET`
  - `android.permission.ACCESS_NETWORK_STATE`
  - `android.permission.ACCESS_WIFI_STATE`
  - `android.permission.POST_NOTIFICATIONS` (Android 13+)
  - `android.permission.WAKE_LOCK`
  - `android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
  - `android.permission.FOREGROUND_SERVICE`
  - `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- **Poin Persiapan V2:** Untuk implementasi Media3, service baru `MusicPlaybackService` (turunan `MediaSessionService`) akan ditambahkan dengan `foregroundServiceType="mediaPlayback"` dan intent filter `androidx.media3.session.MediaSessionService`.

---

## 4. AUDIT BACKEND API & STREAMING ENGINE

### 4.1 Route Handlers (11 Endpoints di `app/api/`)

| Endpoint | File | Fungsi Utama & Strategi |
|---|---|---|
| `/api/stream` | `stream/route.ts` | Resolusi yt-dlp, proxy audio chunked, cache VPS disk |
| `/api/audio` | `audio/route.ts` | Re-export alias `/api/stream` untuk kompatibilitas mundur |
| `/api/download` | `download/route.ts` | Stream attachment dengan Content-Disposition |
| `/api/search` | `search/route.ts` | Multi-tier search: YT Music API -> iTunes Catalog Fallback |
| `/api/suggest` | `suggest/route.ts` | Autocomplete suggestions |
| `/api/lyrics` | `lyrics/route.ts` | Multi-source: LRCLIB -> secondary lyrics providers |
| `/api/artist` | `artist/route.ts` | Metadata artis & diskografi |
| `/api/album` | `album/route.ts` | Tracklist & metadata album |
| `/api/ytplaylist` | `ytplaylist/route.ts`| Parsing playlist YouTube Music |
| `/api/upnext` | `upnext/route.ts` | Queue recommendation (up next) |
| `/api/icon` | `icon/route.ts` | App icon / dynamic favicon |

### 4.2 Mekanisme Ketahanan Streaming & Anti-Blocking
1. **Cookie Pool Management (`lib/cookieRotator.ts`):**
   - Mendeteksi berkas `cookies*.txt` secara otomatis.
   - Rotasi otomatis setiap interval waktu atau batas request.
   - Deteksi proaktif jika file cookie hilang: beralih ke *multi-tier client spoofing* (mobile/visionOS client) sehingga stream tetap dapat disajikan tanpa error 500.
2. **VPS Disk Cache (`lib/audioCache.ts`):**
   - Menyimpan audio yang sudah diputar di direktori storage lokal.
   - In-flight deduplication: jika ada permintaan paralel untuk ID yang sama, hanya satu proses download yang berjalan ke upstream.
   - Otomatis LRU cleanup berbasis batas kuota disk.
3. **In-Memory Rate Limiter (`lib/rateLimit.ts`):**
   - Perlindungan anti-abuse untuk stream dan search.

---

## 5. AUDIT INTEGRASI CAPACITOR & ARSITEKTUR HYBRID

### 5.1 Analisis `capacitor.config.ts`
```typescript
const config: CapacitorConfig = {
  appId: 'com.musicfy.app',
  appName: 'MusicFY',
  webDir: 'public',
  server: {
    url: 'https://shanz.my.id',
    cleartext: true
  }
};
```
- **Karakteristik Arsitektur:**
  Karena `server.url` disetel ke `'https://shanz.my.id'`, APK bertindak sebagai **Native Web Shell** yang memuat aplikasi live dari server produksi.
- **Keuntungan:** Update antarmuka frontend, penambahan fitur visual, dan perbaikan minor langsung aktif di APK tanpa memerlukan update biner APK di perangkat pengguna.
- **Implikasi Native Media3:**
  Native ExoPlayer pada APK harus menerima URL streaming langsung (`https://shanz.my.id/api/stream?id=...`) melalui bridge JavascriptInterface dari WebView.

---

## 6. AUDIT BUILD SYSTEM & GITHUB ACTIONS CI/CD

### 6.1 Analisis Workflow GitHub Actions
- **Workflow Aktif:** `.github/workflows/build-apk.yml`
  - Runner: `ubuntu-latest`
  - Node.js: `20`
  - Java: `21` (Temurin)
  - Build Steps: `npm install` -> `npm run build` -> `npx cap sync android` -> `./gradlew assembleDebug`
  - Upload Artifact: `app-debug.apk`

- **Temuan & Tindakan:**
  Ditemukan berkas `build-apk.yml` usang di direktori root yang masih mereferensikan Java 17 dan perintah usang `npx cap add android`. Berkas duplikat ini telah **dihapus** di Tahap 2 untuk menghindari ambiguitas konfigurasi CI/CD.

### 6.2 Lingkungan Android SDK Lokal vs CI
- Di mesin lokal developer: `ANDROID_HOME` belum terkonfigurasi secara default (tidak ada Android SDK lokal).
- CI/CD di GitHub Actions: Memiliki Android SDK lengkap dan Java 21 siap pakai.
- Build lokal dapat dijalankan dengan memasang Android SDK atau mengandalkan CI/CD workflow yang sudah tervalidasi.

---

## 7. MATRIKS MASALAH & RISIKO (FINDINGS & RESOLUTIONS)

| Kode | Tingkat | Masalah yang Ditemukan | Dampak | Status di Tahap 2 |
|---|---|---|---|---|
| **C1** | **CRITICAL** | `android.media.session.MediaSession` & `Notification.MediaStyle` legacy di `MediaSessionBridge.java` | Deprecated pada Android 15 (API 35); rentan background kill | Dipetakan untuk migrasi penuh ke Media3 di Tahap berikutnya |
| **C2** | **CRITICAL** | Audio playback Android masih bergantung pada HTML5 Audio di dalam WebView | Audio berhenti jika WebView di-pause atau dibekukan OS | Dipetakan untuk digantikan ExoPlayer di Tahap berikutnya |
| **C3** | **CRITICAL** | Duplikat `build-apk.yml` di root (Java 17 vs Java 21) | Kebingungan pipeline CI/CD | **SELESAI DIPERBAIKI** (file duplikat dihapus) |
| **M1** | **MEDIUM** | Keystore (`*.jks`, `*.keystore`) belum di-ignore di git | Risiko kebocoran sertifikat signing ke repositori | **SELESAI DIPERBAIKI** (uncomment di `android/.gitignore` & tambahkan di `.gitignore`) |
| **M2** | **MEDIUM** | Ukuran memory heap Gradle JVM default `-Xmx1536m` | Risiko OutOfMemory saat kompilasi library Media3 | **SELESAI DIPERBAIKI** (dinaikkan ke `-Xmx2048m`) |
| **M3** | **MEDIUM** | `proguard-rules.pro` belum memproteksi JavascriptInterface & Media3 | Kelas bridge dan Media3 bisa ter-strip saat release obfuscation | **SELESAI DIPERBAIKI** (aturan ProGuard ditambahkan) |
| **M4** | **MEDIUM** | Belum ada pipeline otomatis Signed Release APK | APK rilis belum bisa otomatis di-tag dan dipublish ke GitHub Releases | Dijadwalkan pada Tahap 5 |
| **M5** | **MEDIUM** | Belum ada endpoint `/api/version` untuk update checker | Aplikasi Android tidak dapat memeriksa versi rilis baru | Dijadwalkan pada Tahap 6 |
| **L1** | **LOW** | `cordova.variables.gradle` sempat tidak terbaca sebelum sync | Gradle error jika `npx cap sync` belum dijalankan | **TERVALIDASI** (`npx cap sync android` menyelesaikan issue) |

---

## 8. PERSIAPAN TEKNIS YANG TELAH DILAKSANAKAN PADA TAHAP 2

1. **Keamanan Kredensial & Signing:**
   - Diperbarui `android/.gitignore` untuk mengabaikan `*.jks` dan `*.keystore`.
   - Diperbarui `.gitignore` di root untuk mengabaikan `*.jks`, `*.keystore`, `*.apk`, dan `*.aab`.
2. **Optimasi Build Environment:**
   - Diperbarui `android/gradle.properties`: Nilai `org.gradle.jvmargs` ditingkatkan menjadi `-Xmx2048m` guna memastikan kelancaran build modular Media3.
3. **Proteksi Kode Native & Release Rules:**
   - Diperbarui `android/app/proguard-rules.pro` dengan aturan eksplisit untuk mempertahankan:
     - `@android.webkit.JavascriptInterface`
     - Kelas namespace `com.musicfy.app.**` dan `com.getcapacitor.**`
     - Library `androidx.media3.**`
4. **Pembersihan Root Repository:**
   - Berkas usang `build-apk.yml` di direktori root telah dihapus.
5. **Verifikasi Sinkronisasi Capacitor:**
   - Dijalankan `npx cap sync android` dengan status sukses (plugin `@capacitor/app@8.1.2` terverifikasi terdaftar).
6. **Verifikasi Kompilasi Frontend:**
   - Dijalankan `npm run build` dengan hasil 100% sukses tanpa error kompilasi.

---

## 9. CHECKLIST KESIAPAN MENUJU TAHAP BERIKUTNYA

- [x] Struktur proyek bersih, stabil, dan teruji via `npm run build`.
- [x] Sinkronisasi asset dan plugin Capacitor berhasil (`npx cap sync android`).
- [x] Seluruh dependensi, jalur komunikasi bridge, dan titik integrasi terpetakan secara presisi.
- [x] Aturan ProGuard dan konfigurasi memori Gradle sudah disiapkan untuk paket Media3.
- [x] Seluruh perubahan Tahap 1 (`MUSICFY_V2_ARCHITECTURE.md`, `MUSICFY_V2_IMPLEMENTATION_PLAN.md`, `MUSICFY_V2_MANUAL_REQUIREMENTS.md`) dipertahankan tanpa perubahan destruktif.
- [x] Tidak ada implementasi kode Media3 yang dimulai sebelum tahap persiapan ini tuntas (mematuhi Instruksi Poin 8).

Tahap 2 (Project Audit & Preparation) dinyatakan **SELESAI LENGKAP**. Sistem siap memasuki tahap pengerjaan selanjutnya.
