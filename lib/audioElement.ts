/**
 * Global Persistent Audio Element Singleton & Immediate Playback Controller
 * Attached to document.body, survives all page transitions & component lifecycle
 */

let persistentAudioElement: HTMLAudioElement | null = null;

export function getPersistentAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!persistentAudioElement) {
    let el = (document.getElementById('pmusic-persistent-audio') ||
      document.getElementById('sann-persistent-audio')) as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'pmusic-persistent-audio';
      el.preload = 'auto';
      el.setAttribute('playsinline', 'true');
      el.setAttribute('webkit-playsinline', 'true');
      el.style.position = 'fixed';
      el.style.bottom = '0';
      el.style.left = '0';
      el.style.width = '0';
      el.style.height = '0';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '-9999';
      document.body.appendChild(el);
    }
    persistentAudioElement = el;
  }
  return persistentAudioElement;
}

/**
 * Immediate, synchronous audio playback invocation
 * Executed synchronously within physical user click/touch handlers
 * to guarantee browser Autoplay policy compliance across Chrome, Safari iOS, and Android
 */
export function playTrackImmediately(targetVid: string, autoPlay: boolean = true): void {
  if (typeof window === 'undefined' || !targetVid) return;
  try {
    const audio = getPersistentAudioElement();
    if (!audio) return;

    const streamUrl = `/api/stream?id=${encodeURIComponent(targetVid)}`;
    const isSameSrc = audio.src === streamUrl || audio.src.endsWith(encodeURIComponent(targetVid));

    if (!isSameSrc) {
      audio.src = streamUrl;
      audio.currentTime = 0;
      audio.load();
    }

    if (autoPlay) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Safely catch browser autoplay restrictions without red console warnings
        });
      }
    }
  } catch {}
}
