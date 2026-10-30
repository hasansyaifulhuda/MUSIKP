# MUSICFY V2 — ARCHITECTURE DOCUMENTATION

> **Branch:** `musicfy-v2-development`
> **Tanggal Audit:** 2026-10-30
> **Domain Produksi:** https://shanz.my.id
> **App ID Android:** `com.musicfy.app` (JANGAN DIGANTI)

---

## 1. Arsitektur V1 (Eksisting — Teraudit)

### 1.1 Stack Teknologi

| Layer | Teknologi | Versi |
|---|---|---|
| Framework Web | Next.js | ^15.4.9 |
| Language | TypeScript | 5.9.3 |
| UI | React | ^19.2.1 |
| Styling | TailwindCSS v4 | 4.1.11 |
| State Management | Zustand | ^5.0.12 |
| Animation | Motion (Framer) | ^12.23.24 |
| Icons | Lucide React | ^0.553.0 |
| IndexedDB | idb | ^8.0.3 |
| Android Shell | Capacitor | ^8.6.0 |
| Audio Engine (Web) | HTML5 Audio API (native browser) | — |
| Audio Engine (Android) | MediaSession + HTML5 Audio via WebView | — |
| Build Mode | Next.js output standalone | — |

### 1.2 Struktur Direktori V1

```
MusicFY-main/
├── app/                          # Next.js App Router
│   ├── api/                      # Server-Side API Routes
│   │   ├── stream/route.ts       # Audio streaming proxy (yt-dlp)
│   │   ├── download/route.ts     # Download endpoint (cache-first MP3)
│   │   ├── search/route.ts       # YouTube Music search
│   │   ├── lyrics/route.ts       # Lyrics fetch
│   │   ├── album/route.ts        # Album metadata
│   │   ├── artist/route.ts       # Artist info
│   │   ├── audio/route.ts        # Audio URL resolver (JSON)
│   │   ├── icon/route.ts         # Favicon proxy
│   │   ├── suggest/route.ts      # Search suggestions
│   │   ├── upnext/route.ts       # Up Next queue
│   │   └── ytplaylist/route.ts   # YouTube Playlist fetch
│   ├── layout.tsx                # Root layout (platform detection, providers)
│   ├── page.tsx                  # Home page (~39KB, rich feed)
│   ├── search/page.tsx
│   ├── album/[id]/
│   ├── artist/[id]/
│   ├── playlist/[id]/
│   ├── library/page.tsx          # Offline library
│   ├── history/page.tsx          # Play history
│   ├── top50/page.tsx
│   ├── settings/page.tsx
│   ├── download/page.tsx         # Download management
│   ├── install-apk/page.tsx      # APK install landing page
│   └── developer/page.tsx        # Developer diagnostics
├── components/                   # 39 React components
│   ├── Player.tsx                # Main audio player (~71KB)
│   ├── BottomNav.tsx             # Mobile navigation (~13KB)
│   ├── FullScreenLyrics.tsx      # Lyrics fullscreen (~29KB)
│   ├── LyricsView.tsx            # Inline lyrics (~20KB)
│   ├── AudioVisualizer.tsx
│   ├── EqualizerModal.tsx        # 10-band EQ + presets
│   ├── FloatingLyricsPill.tsx
│   ├── FloatingWidget.tsx
│   └── ... (31 more)
├── context/
│   └── MusicContext.tsx          # Global music context (~69KB)
├── lib/                          # 38 utility/service modules
│   ├── audioResolver.ts          # yt-dlp wrapper (~29KB)
│   ├── audioCache.ts             # VPS disk cache manager (~21KB)
│   ├── audioEffects.ts           # Web Audio API effects (~21KB)
│   ├── db.ts                     # IndexedDB schema & ORM (~48KB)
│   ├── store.ts                  # Zustand global store (~25KB)
│   ├── backgroundService.ts      # Capacitor plugin bridge
│   ├── platform.ts               # Platform/OS detection
│   ├── cookieRotator.ts          # YouTube cookie rotation (~13KB)
│   ├── rateLimit.ts              # In-memory rate limiter
│   └── ... (29 more)
├── hooks/                        # 7 custom React hooks
├── android/                      # Capacitor Android project
│   └── app/src/main/java/com/musicfy/app/
│       ├── MainActivity.java     # Capacitor BridgeActivity
│       ├── MediaSessionBridge.java  # Native MediaSession (~28KB)
│       ├── AudioForegroundService.java  # Foreground Service
│       └── MusicBackgroundPlugin.java  # Capacitor Plugin
├── public/
│   ├── sw.js                     # Service Worker (PWA)
│   ├── manifest.json             # PWA manifest
│   └── workers/lyricsWorker.js   # Web Worker (lyrics parsing)
├── capacitor.config.ts
├── next.config.ts
└── package.json
```

### 1.3 Fitur V1 yang Sudah Berjalan

| Fitur | Status | Lokasi |
|---|---|---|
| Music streaming (HTML5 Audio) | Active | lib/audioElement.ts, components/Player.tsx |
| Audio proxy via yt-dlp (VPS) | Active | app/api/stream/route.ts |
| VPS disk cache (MP3/Opus, max 10GB) | Active | lib/audioCache.ts |
| YouTube Music search | Active | app/api/search/route.ts |
| Lyrics (synced + unsynced) | Active | app/api/lyrics/route.ts |
| Offline download (IndexedDB) | Active | lib/db.ts |
| 10-band Equalizer | Active | lib/audioEffects.ts |
| Audio visualizer | Active | components/AudioVisualizer.tsx |
| PWA (installable) | Active | public/sw.js, public/manifest.json |
| Android APK (Capacitor) | Active | android/ |
| Android MediaSession (notification + lockscreen) | Active | MediaSessionBridge.java |
| Android Foreground Service (background playback) | Active | AudioForegroundService.java |
| Android Battery Optimization Bypass | Active | MusicBackgroundPlugin.java |
| Platform detection | Active | lib/platform.ts |
| Sleep timer | Active | lib/sleepTimerStore.ts |
| Crossfade | Active | lib/crossfadeStore.ts |
| Queue / Up Next | Active | app/api/upnext/route.ts |
| History | Active | app/history/page.tsx |
| Custom playlists | Active | lib/db.ts |
| Rate limiting | Active | lib/rateLimit.ts |
| Cookie rotation (YouTube anti-bot) | Active | lib/cookieRotator.ts |
| GitHub Actions APK build | Active | .github/workflows/build-apk.yml |
| APK install landing page | Active | app/install-apk/page.tsx |

---

## 2. Arsitektur Target V2

### 2.1 Perbedaan V1 → V2

| Komponen | V1 (Sekarang) | V2 (Target) |
|---|---|---|
| Android Audio Engine | HTML5 Audio via WebView | Media3 ExoPlayer (native) |
| Android Background | AudioForegroundService (Service biasa) | MediaSessionService (Media3) |
| Android Notifikasi | Notification.MediaStyle manual | Media3 DefaultMediaNotificationProvider |
| Android Lock Screen | MediaSession manual (legacy android.media) | Media3 MediaSession (androidx.media3) |
| GitHub Actions APK | Debug APK only → Artifact | Debug + Release APK → GitHub Releases |
| Backend API | Next.js Route Handlers | +/api/version dan /download/ endpoint |
| APK Distribution | GitHub Artifact only | GitHub Releases + /download/ halaman |

### 2.2 Arsitektur V2 — Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    https://shanz.my.id                              │
│                    (VPS — Next.js Standalone)                       │
├─────────────────────────────────────────────────────────────────────┤
│  Routes (Path-based, NO subdomain):                                 │
│  /                    → Home (Feed musik)                           │
│  /search              → Search                                      │
│  /api/stream          → Audio streaming proxy (yt-dlp)             │
│  /api/download        → MP3 download                               │
│  /api/search          → YouTube Music search                        │
│  /api/lyrics          → Lyrics                                      │
│  /api/version         → [V2 BARU] Versi app dan APK info           │
│  /download/           → [V2 BARU] APK download landing page        │
│  /install-apk         → APK install guide (existing)               │
│  ...                  → semua route yang sudah ada                  │
└─────────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐           ┌──────────────────────┐
│  Browser/PWA    │           │  Android APK          │
│  (HTML5 Audio)  │           │  (Capacitor Shell)    │
│  - Web Audio API│           │  ┌────────────────┐  │
│  - IndexedDB    │           │  │ WebView Layer  │  │
│  - Service Worker│          │  │ (Next.js App)  │  │
│  - MediaSession │           │  └───────┬────────┘  │
│    (browser API)│           │          │ Bridge     │
└─────────────────┘           │  ┌───────▼────────┐  │
                              │  │ Media3 ExoPlayer│  │
                              │  │ (Native Audio)  │  │
                              │  └───────┬────────┘  │
                              │          │            │
                              │  ┌───────▼────────┐  │
                              │  │MediaSessionSvc  │  │
                              │  │(Background +    │  │
                              │  │ Notification +  │  │
                              │  │ Lock Screen)    │  │
                              │  └────────────────┘  │
                              └──────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  GitHub Actions       │
                              │  (Build APK)          │
                              │  → GitHub Releases    │
                              │  → /download/ page    │
                              └──────────────────────┘
```

### 2.3 Komponen V2 — Android Native Audio

**Struktur baru:**
```
android/app/src/main/java/com/musicfy/app/
├── MainActivity.java              # Tetap, minor update
├── MediaSessionBridge.java        # Refaktor → jadi ExoPlayer Bridge
├── AudioForegroundService.java    # Diganti oleh MusicPlaybackService.java
├── MusicBackgroundPlugin.java     # Tetap + extension untuk ExoPlayer control
├── MusicPlaybackService.java      # [BARU] Media3 MediaSessionService
├── ExoPlayerManager.java          # [BARU] ExoPlayer lifecycle + audio focus
└── ExoPlayerBridge.java           # [BARU] JavaScript <-> ExoPlayer bridge
```

**Media3 Dependencies (android/app/build.gradle):**
```groovy
implementation "androidx.media3:media3-exoplayer:1.4.1"
implementation "androidx.media3:media3-session:1.4.1"
implementation "androidx.media3:media3-ui:1.4.1"
implementation "androidx.media3:media3-common:1.4.1"
```

---

## 3. Data Flow V2

### 3.1 Web/PWA Audio Flow (TIDAK BERUBAH)
```
User → Player.tsx → audioElement.ts → HTML5 Audio API
     → /api/stream?id=<videoId>
     → audioResolver.ts (yt-dlp) → Audio Stream
     → VPS disk cache (storage/audio-cache/)
```

### 3.2 Android Audio Flow V2 (BARU)
```
User → Player.tsx (WebView) → ExoPlayerBridge.java (JavascriptInterface)
     → ExoPlayerManager.java → Media3 ExoPlayer
     → /api/stream?id=<videoId> (via HTTP dari ExoPlayer)
     → Audio decoded natively (hardware accelerated)
     → MusicPlaybackService.java (MediaSessionService)
     → Notification (Media3 DefaultMediaNotificationProvider)
     → Lock Screen Controls (Media3 MediaSession)
```

### 3.3 APK Distribution Flow V2 (BARU)
```
git push tag → GitHub Actions (build-apk-release.yml)
             → assembleRelease (signed APK)
             → GitHub Releases (tagged v2.x.x)
             → /download/ page (fetch GitHub Releases API)
             → User download APK
```

---

## 4. Database & Storage

### 4.1 Client-Side (IndexedDB via idb)

| Store | Isi | Penggunaan |
|---|---|---|
| tracks | Cache track metadata | Pencarian cepat |
| history | Riwayat putar (max 50) | app/history/page.tsx |
| offline_tracks | Blob audio offline | app/download/page.tsx |
| playlists | Custom playlists | lib/db.ts |
| saved_albums | Album yang disimpan | lib/db.ts |
| subscribed_artists | Artis yang diikuti | lib/db.ts |
| lyrics_cache | Cache lirik (compressed) | lib/lyricsCache.ts |
| settings | Preferensi pengguna | lib/store.ts |

### 4.2 Server-Side (VPS Disk Cache)

| Path | Isi | Manager |
|---|---|---|
| storage/audio-cache/ | MP3/Opus audio cache (max 10GB) | lib/audioCache.ts |
| storage/cookies.txt | YouTube cookies (anti-bot) | lib/cookieRotator.ts |

---

## 5. API Endpoints

### Endpoints V1 (Semua Dipertahankan)

| Endpoint | Fungsi |
|---|---|
| GET /api/stream?id=<videoId> | Audio streaming proxy |
| GET /api/download?id=<videoId> | MP3 download |
| GET /api/search?q=<query> | YouTube Music search |
| GET /api/lyrics?id=<videoId> | Lyrics fetch |
| GET /api/album?id=<albumId> | Album metadata |
| GET /api/artist?id=<artistId> | Artist info |
| GET /api/audio?id=<videoId> | Audio URL (JSON) |
| GET /api/icon?url=<url> | Favicon proxy |
| GET /api/suggest?q=<query> | Search suggestions |
| GET /api/upnext?id=<videoId> | Up Next tracks |
| GET /api/ytplaylist?id=<id> | YouTube Playlist |

### Endpoints V2 Baru

| Endpoint | Fungsi |
|---|---|
| GET /api/version | Versi app, APK terbaru, changelog |
| GET /download/ | APK download landing page |

---

## 6. GitHub Actions Pipeline V2

### Workflow Existing: .github/workflows/build-apk.yml
- Trigger: push ke main
- Output: Debug APK → GitHub Artifact
- Kekurangan: Tidak ada signed release, tidak ada GitHub Releases

### Workflow Baru V2: .github/workflows/build-apk-release.yml
- Trigger: push tag v* (misalnya v2.0.0)
- Steps: Checkout → Node 20 → npm install && build → JDK 21 → cap sync → Signing → assembleRelease → GitHub Releases
- Output: Signed Release APK di GitHub Releases

---

## 7. Perubahan Arsitektur yang TIDAK Boleh Dilakukan

- DILARANG: Mengganti appId com.musicfy.app di capacitor.config.ts
- DILARANG: Menghapus MediaSessionBridge.java sebelum ExoPlayer bridge stabil
- DILARANG: Mengganti Next.js dengan framework lain
- DILARANG: Menghapus IndexedDB schema tanpa migrasi
- DILARANG: Menghapus VPS disk cache system
- DILARANG: Menambah subdomain (harus path-based di shanz.my.id)
- DILARANG: Push/commit/deploy otomatis ke produksi
- DILARANG: Menghapus storage/audio-cache/ atau storage/cookies.txt

---

## 8. Dependency Versions Penting

- @capacitor/android: ^8.6.0
- @capacitor/core: ^8.6.0
- next: ^15.4.9
- react: ^19.2.1
- zustand: ^5.0.12
- tailwindcss: 4.1.11
- Media3 target: androidx.media3:* 1.4.1
- Android minSdkVersion: 23 (Android 6.0+)
- Android compileSdkVersion: 35
- Android targetSdkVersion: 35
