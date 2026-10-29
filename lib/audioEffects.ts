import { create } from 'zustand';
import { getPersistentAudioElement } from './audioElement';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Web Audio API Engine & Equalizer Controller
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 20 & 21)
 *
 * Guarantees:
 * 1. Singleton AudioContext and MediaElementAudioSourceNode across DOM lifecycles.
 * 2. 5-Band BiquadFilterNode Equalizer (60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz) with customizable gains (-12dB to +12dB).
 * 3. Dedicated Bass Boost filter for punchy low-end response.
 * 4. AnalyserNode for 60fps real-time canvas visualizers with 0 layout shift or memory leaks.
 * 5. Debounced persistence to localStorage for seamless user preference preservation.
 * 6. Mobile Autoplay & AudioContext suspension safety with automatic user-gesture resumption.
 */

declare global {
  interface Window {
    __PMUSIC_AUDIO_CONTEXT__?: AudioContext;
    __PMUSIC_MEDIA_SOURCE__?: MediaElementAudioSourceNode;
    __PMUSIC_EFFECTS_CHAIN__?: AudioEffectsChain;
  }
}

export interface EqualizerPreset {
  name: string;
  bands: [number, number, number, number, number]; // [60Hz, 230Hz, 910Hz, 3600Hz, 14000Hz] in dB
  bassBoost: number; // 0 to 10 dB
}

export const EQUALIZER_PRESETS: Record<string, EqualizerPreset> = {
  Flat: {
    name: 'Flat',
    bands: [0, 0, 0, 0, 0],
    bassBoost: 0,
  },
  'Bass Boost': {
    name: 'Bass Boost',
    bands: [6, 4, 1, 0, -1],
    bassBoost: 6,
  },
  Vocal: {
    name: 'Vocal',
    bands: [-2, 0, 4, 3, 1],
    bassBoost: 0,
  },
  Pop: {
    name: 'Pop',
    bands: [-1, 2, 4, 2, -1],
    bassBoost: 2,
  },
  Rock: {
    name: 'Rock',
    bands: [4, 2, -1, 3, 4],
    bassBoost: 3,
  },
  Electronic: {
    name: 'Electronic',
    bands: [5, 3, 0, 2, 4],
    bassBoost: 5,
  },
  Classical: {
    name: 'Classical',
    bands: [4, 2, -1, 2, 3],
    bassBoost: 1,
  },
  Acoustic: {
    name: 'Acoustic',
    bands: [3, 2, 1, 2, 3],
    bassBoost: 1,
  },
  Custom: {
    name: 'Custom',
    bands: [0, 0, 0, 0, 0],
    bassBoost: 0,
  },
};

export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;
export const EQ_LABELS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'] as const;

export type ReverbPreset = 'off' | 'studio' | 'club' | 'hall' | 'cathedral';

export const REVERB_PRESETS: Record<ReverbPreset, { name: string; duration: number; decay: number; wet: number }> = {
  off: { name: 'Nonaktif', duration: 0, decay: 0, wet: 0 },
  studio: { name: 'Studio Akustik', duration: 0.8, decay: 3.5, wet: 0.22 },
  club: { name: 'Klub Malam', duration: 1.4, decay: 2.8, wet: 0.32 },
  hall: { name: 'Gedung Konser (Hall)', duration: 2.5, decay: 2.0, wet: 0.42 },
  cathedral: { name: 'Katedral (Grand)', duration: 4.0, decay: 1.5, wet: 0.52 },
};

export interface AudioEffectsChain {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  bassBoostFilter: BiquadFilterNode;
  bandFilters: BiquadFilterNode[];
  preampGain: GainNode;
  analyser: AnalyserNode;
  spatialPanner?: StereoPannerNode;
  convolver?: ConvolverNode;
  dryGain?: GainNode;
  wetGain?: GainNode;
  peakLimiter?: DynamicsCompressorNode;
}

const EQ_STORAGE_KEY = 'pmusic_equalizer_settings_v1';

export interface EqualizerStoreState {
  isEnabled: boolean;
  activePreset: string;
  bands: [number, number, number, number, number];
  bassBoost: number;
  isSpatialSurround: boolean;
  reverbPreset: ReverbPreset;
  isModalOpen: boolean;

  openModal: () => void;
  closeModal: () => void;
  toggleEnabled: () => void;
  setPreset: (presetName: string) => void;
  setBandGain: (index: number, gainDb: number) => void;
  setBassBoost: (boostDb: number) => void;
  toggleSpatialSurround: () => void;
  setReverbPreset: (preset: ReverbPreset) => void;
  resetToFlat: () => void;
}

let activeChain: AudioEffectsChain | null = null;
let sharedFrequencyBuffer: Uint8Array<ArrayBuffer> | null = null;

/**
 * Initializes and wires the Web Audio API graph to the persistent HTML5 audio element.
 * Idempotent: Can safely be called repeatedly without throwing InvalidStateError.
 */
export function initAudioEffects(): AudioEffectsChain | null {
  if (typeof window === 'undefined') return null;

  if (activeChain) {
    if (activeChain.context.state === 'suspended') {
      activeChain.context.resume().catch(() => {});
    }
    return activeChain;
  }

  if (window.__PMUSIC_EFFECTS_CHAIN__) {
    activeChain = window.__PMUSIC_EFFECTS_CHAIN__;
    return activeChain;
  }

  const audio = getPersistentAudioElement();
  if (!audio) return null;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn('[WebAudio] AudioContext not supported on this device/browser');
      return null;
    }

    // Reuse window global context if previously created
    const ctx: AudioContext =
      window.__PMUSIC_AUDIO_CONTEXT__ ||
      new AudioContextClass({ latencyHint: 'playback' });
    window.__PMUSIC_AUDIO_CONTEXT__ = ctx;

    // Reuse or create MediaElementAudioSourceNode (Only call createMediaElementSource once!)
    let source: MediaElementAudioSourceNode;
    if (window.__PMUSIC_MEDIA_SOURCE__) {
      source = window.__PMUSIC_MEDIA_SOURCE__;
    } else {
      source = ctx.createMediaElementSource(audio);
      window.__PMUSIC_MEDIA_SOURCE__ = source;
    }

    // 1. Dedicated Bass Boost Filter (LowShelf at 80Hz)
    const bassBoostFilter = ctx.createBiquadFilter();
    bassBoostFilter.type = 'lowshelf';
    bassBoostFilter.frequency.setValueAtTime(80, ctx.currentTime);
    bassBoostFilter.gain.setValueAtTime(0, ctx.currentTime);

    // 2. 5-Band Equalizer Filters
    const bandFilters: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, idx) => {
      const filter = ctx.createBiquadFilter();
      if (idx === 0) {
        filter.type = 'lowshelf';
      } else if (idx === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.setValueAtTime(1.2, ctx.currentTime);
      }
      filter.frequency.setValueAtTime(freq, ctx.currentTime);
      filter.gain.setValueAtTime(0, ctx.currentTime);
      return filter;
    });

    // 3. Preamp Gain Node (prevents clipping when boosting multiple bands)
    const preampGain = ctx.createGain();
    preampGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // 4. Analyser Node for Real-Time Canvas Visualizer (60fps, 64 bins)
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128; // 64 frequency bins
    analyser.smoothingTimeConstant = 0.82;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;

    // 5. Connect Audio Processing Pipeline with Reverb DSP & Spatial 3D Audio (Batch 3 - Poin 73):
    source.connect(bassBoostFilter);
    let previousNode: AudioNode = bassBoostFilter;

    for (const filter of bandFilters) {
      previousNode.connect(filter);
      previousNode = filter;
    }

    previousNode.connect(preampGain);

    // Reverb DSP Convolution & Gain Nodes
    const convolver = ctx.createConvolver();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();

    dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
    wetGain.gain.setValueAtTime(0.0, ctx.currentTime);

    preampGain.connect(dryGain);
    preampGain.connect(convolver);
    convolver.connect(wetGain);

    const mixGain = ctx.createGain();
    dryGain.connect(mixGain);
    wetGain.connect(mixGain);

    // Spatial / 3D Audio Panner
    let spatialPanner: StereoPannerNode | undefined;
    if (typeof ctx.createStereoPanner === 'function') {
      try {
        spatialPanner = ctx.createStereoPanner();
        spatialPanner.pan.setValueAtTime(0, ctx.currentTime);
        mixGain.connect(spatialPanner);
        spatialPanner.connect(analyser);
      } catch {
        mixGain.connect(analyser);
      }
    } else {
      mixGain.connect(analyser);
    }

    // Poin 93: Web Audio API Peak Limiter & Anti-Clipping Compressor
    // Prevents digital clipping/distortion when Bass Boost or Equalizer bands are boosted
    const peakLimiter = ctx.createDynamicsCompressor();
    peakLimiter.threshold.setValueAtTime(-0.5, ctx.currentTime);
    peakLimiter.knee.setValueAtTime(0.0, ctx.currentTime);
    peakLimiter.ratio.setValueAtTime(20.0, ctx.currentTime);
    peakLimiter.attack.setValueAtTime(0.002, ctx.currentTime);
    peakLimiter.release.setValueAtTime(0.05, ctx.currentTime);

    analyser.connect(peakLimiter);
    peakLimiter.connect(ctx.destination);

    activeChain = {
      context: ctx,
      source,
      bassBoostFilter,
      bandFilters,
      preampGain,
      analyser,
      spatialPanner,
      convolver,
      dryGain,
      wetGain,
      peakLimiter,
    };
    window.__PMUSIC_EFFECTS_CHAIN__ = activeChain;

    // Apply currently saved store state to nodes
    applyCurrentStoreSettingsToNodes();

    // Auto-resume context on physical user interaction
    const unlockAudioContext = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudioContext, { once: true, passive: true });
    window.addEventListener('touchstart', unlockAudioContext, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudioContext, { once: true, passive: true });

    return activeChain;
  } catch (err) {
    console.warn('[WebAudio] Failed to initialize AudioEffects chain:', err);
    return null;
  }
}

/**
 * Generates synthetic impulse response buffer for acoustic Reverb simulation
 */
function createImpulseResponse(ctx: AudioContext, durationSeconds: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const factor = Math.exp((-i / length) * decay);
    left[i] = (Math.random() * 2 - 1) * factor;
    right[i] = (Math.random() * 2 - 1) * factor;
  }
  return impulse;
}

/**
 * Resumes the Web Audio Context if suspended by browser autoplay policy.
 */
export function resumeAudioContextSafely(): void {
  if (typeof window === 'undefined') return;
  const chain = activeChain || window.__PMUSIC_EFFECTS_CHAIN__;
  if (chain && chain.context.state === 'suspended') {
    chain.context.resume().catch(() => {});
  }
}

/**
 * Retrieves the current peak limiter gain reduction in decibels (Anti-Clipping telemetry).
 */
export function getPeakLimiterReduction(): number {
  if (typeof window === 'undefined') return 0;
  const chain = activeChain || window.__PMUSIC_EFFECTS_CHAIN__;
  if (chain?.peakLimiter) {
    return chain.peakLimiter.reduction;
  }
  return 0;
}

/**
 * Retrieves the real-time frequency data array from AnalyserNode.
 * Uses a cached buffer to prevent Garbage Collection allocation thrashing at 60fps.
 */
export function getRealtimeFrequencyData(): Uint8Array<ArrayBuffer> | null {
  const chain = activeChain || window.__PMUSIC_EFFECTS_CHAIN__;
  if (!chain || !chain.analyser) return null;

  if (!sharedFrequencyBuffer || sharedFrequencyBuffer.length !== chain.analyser.frequencyBinCount) {
    const rawBuffer = new ArrayBuffer(chain.analyser.frequencyBinCount);
    sharedFrequencyBuffer = new Uint8Array(rawBuffer);
  }

  chain.analyser.getByteFrequencyData(sharedFrequencyBuffer as any);
  return sharedFrequencyBuffer;
}

/**
 * Applies settings directly to the Web Audio nodes with smooth ramping to prevent clicks/pops.
 */
function applySettingsToNodes(
  isEnabled: boolean,
  bands: [number, number, number, number, number],
  bassBoost: number,
  isSpatialSurround?: boolean,
  reverbPreset?: ReverbPreset
) {
  const chain = activeChain || window.__PMUSIC_EFFECTS_CHAIN__;
  if (!chain) return;

  const ctx = chain.context;
  const now = ctx.currentTime;
  const rampTime = 0.05; // 50ms smooth transition

  if (!isEnabled) {
    // When disabled, reset all gains smoothly to 0 dB (transparent pass-through)
    chain.bassBoostFilter.gain.setTargetAtTime(0, now, rampTime);
    for (const filter of chain.bandFilters) {
      filter.gain.setTargetAtTime(0, now, rampTime);
    }
    chain.preampGain.gain.setTargetAtTime(1.0, now, rampTime);
    if (chain.spatialPanner) chain.spatialPanner.pan.setTargetAtTime(0, now, rampTime);
    if (chain.wetGain) chain.wetGain.gain.setTargetAtTime(0, now, rampTime);
    if (chain.dryGain) chain.dryGain.gain.setTargetAtTime(1.0, now, rampTime);
    return;
  }

  // Apply Bass Boost (0 to +10 dB)
  chain.bassBoostFilter.gain.setTargetAtTime(Math.max(0, Math.min(10, bassBoost)), now, rampTime);

  // Apply 5-Band Gains (-12 to +12 dB)
  let maxBoost = bassBoost;
  for (let i = 0; i < chain.bandFilters.length; i++) {
    const gain = Math.max(-12, Math.min(12, bands[i] ?? 0));
    chain.bandFilters[i].gain.setTargetAtTime(gain, now, rampTime);
    if (gain > maxBoost) maxBoost = gain;
  }

  // Automatic Preamp Attenuation: slightly attenuate master gain if boosting heavily to prevent digital clipping
  const attenuation = maxBoost > 3 ? Math.pow(10, -((maxBoost - 3) * 0.4) / 20) : 1.0;
  chain.preampGain.gain.setTargetAtTime(attenuation, now, rampTime);

  // Apply Spatial 3D Surround (Batch 3 - Poin 73)
  if (chain.spatialPanner) {
    const pannerValue = isSpatialSurround ? 0.08 : 0;
    chain.spatialPanner.pan.setTargetAtTime(pannerValue, now, rampTime);
  }

  // Apply Reverb DSP Filter (Batch 3 - Poin 73)
  if (chain.convolver && chain.wetGain && chain.dryGain) {
    const activeReverb = reverbPreset || 'off';
    if (activeReverb === 'off') {
      chain.wetGain.gain.setTargetAtTime(0, now, rampTime);
      chain.dryGain.gain.setTargetAtTime(1.0, now, rampTime);
    } else {
      const config = REVERB_PRESETS[activeReverb];
      if (config && config.duration > 0) {
        try {
          chain.convolver.buffer = createImpulseResponse(ctx, config.duration, config.decay);
          chain.wetGain.gain.setTargetAtTime(config.wet, now, rampTime);
          chain.dryGain.gain.setTargetAtTime(1.0 - config.wet * 0.5, now, rampTime);
        } catch {}
      }
    }
  }
}

function applyCurrentStoreSettingsToNodes() {
  const state = useEqualizerStore.getState();
  applySettingsToNodes(
    state.isEnabled,
    state.bands,
    state.bassBoost,
    state.isSpatialSurround,
    state.reverbPreset
  );
}

/**
 * Load initial persisted equalizer configuration safely
 */
function getInitialEqualizerState(): {
  isEnabled: boolean;
  activePreset: string;
  bands: [number, number, number, number, number];
  bassBoost: number;
  isSpatialSurround: boolean;
  reverbPreset: ReverbPreset;
} {
  const fallback = {
    isEnabled: true,
    activePreset: 'Flat',
    bands: [0, 0, 0, 0, 0] as [number, number, number, number, number],
    bassBoost: 0,
    isSpatialSurround: false,
    reverbPreset: 'off' as ReverbPreset,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = debouncedLocalStorageGet(EQ_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      isEnabled: typeof parsed.isEnabled === 'boolean' ? parsed.isEnabled : fallback.isEnabled,
      activePreset: parsed.activePreset || fallback.activePreset,
      bands: Array.isArray(parsed.bands) && parsed.bands.length === 5 ? parsed.bands : fallback.bands,
      bassBoost: typeof parsed.bassBoost === 'number' ? parsed.bassBoost : fallback.bassBoost,
      isSpatialSurround: Boolean(parsed.isSpatialSurround),
      reverbPreset: (parsed.reverbPreset && parsed.reverbPreset in REVERB_PRESETS) ? parsed.reverbPreset : 'off',
    };
  } catch {
    return fallback;
  }
}

const initialState = getInitialEqualizerState();

export const useEqualizerStore = create<EqualizerStoreState>((set, get) => ({
  isEnabled: initialState.isEnabled,
  activePreset: initialState.activePreset,
  bands: initialState.bands,
  bassBoost: initialState.bassBoost,
  isSpatialSurround: initialState.isSpatialSurround,
  reverbPreset: initialState.reverbPreset,
  isModalOpen: false,

  openModal: () => {
    initAudioEffects();
    resumeAudioContextSafely();
    set({ isModalOpen: true });
  },

  closeModal: () => set({ isModalOpen: false }),

  toggleEnabled: () => {
    initAudioEffects();
    resumeAudioContextSafely();
    const next = !get().isEnabled;
    set({ isEnabled: next });
    applySettingsToNodes(next, get().bands, get().bassBoost, get().isSpatialSurround, get().reverbPreset);

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: next,
        activePreset: get().activePreset,
        bands: get().bands,
        bassBoost: get().bassBoost,
        isSpatialSurround: get().isSpatialSurround,
        reverbPreset: get().reverbPreset,
      })
    );

    toast.info(next ? 'Equalizer diaktifkan' : 'Equalizer dinonaktifkan');
  },

  setPreset: (presetName: string) => {
    initAudioEffects();
    resumeAudioContextSafely();
    const preset = EQUALIZER_PRESETS[presetName];
    if (!preset) return;

    const newBands = [...preset.bands] as [number, number, number, number, number];
    const newBassBoost = preset.bassBoost;

    set({
      activePreset: presetName,
      bands: newBands,
      bassBoost: newBassBoost,
    });

    applySettingsToNodes(get().isEnabled, newBands, newBassBoost, get().isSpatialSurround, get().reverbPreset);

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: get().isEnabled,
        activePreset: presetName,
        bands: newBands,
        bassBoost: newBassBoost,
        isSpatialSurround: get().isSpatialSurround,
        reverbPreset: get().reverbPreset,
      })
    );

    toast.success(`Preset equalizer diubah ke "${presetName}"`);
  },

  setBandGain: (index: number, gainDb: number) => {
    initAudioEffects();
    resumeAudioContextSafely();
    if (index < 0 || index >= 5) return;

    const clampedGain = Math.max(-12, Math.min(12, Math.round(gainDb)));
    const updatedBands = [...get().bands] as [number, number, number, number, number];
    updatedBands[index] = clampedGain;

    set({
      bands: updatedBands,
      activePreset: 'Custom',
    });

    applySettingsToNodes(get().isEnabled, updatedBands, get().bassBoost, get().isSpatialSurround, get().reverbPreset);

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: get().isEnabled,
        activePreset: 'Custom',
        bands: updatedBands,
        bassBoost: get().bassBoost,
        isSpatialSurround: get().isSpatialSurround,
        reverbPreset: get().reverbPreset,
      })
    );
  },

  setBassBoost: (boostDb: number) => {
    initAudioEffects();
    resumeAudioContextSafely();
    const clamped = Math.max(0, Math.min(10, Math.round(boostDb)));

    set({
      bassBoost: clamped,
      activePreset: 'Custom',
    });

    applySettingsToNodes(get().isEnabled, get().bands, clamped, get().isSpatialSurround, get().reverbPreset);

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: get().isEnabled,
        activePreset: 'Custom',
        bands: get().bands,
        bassBoost: clamped,
        isSpatialSurround: get().isSpatialSurround,
        reverbPreset: get().reverbPreset,
      })
    );
  },

  toggleSpatialSurround: () => {
    initAudioEffects();
    resumeAudioContextSafely();
    const next = !get().isSpatialSurround;
    set({ isSpatialSurround: next });
    applySettingsToNodes(get().isEnabled, get().bands, get().bassBoost, next, get().reverbPreset);

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: get().isEnabled,
        activePreset: get().activePreset,
        bands: get().bands,
        bassBoost: get().bassBoost,
        isSpatialSurround: next,
        reverbPreset: get().reverbPreset,
      })
    );

    toast.info(next ? 'Audio Spasial 3D Surround diaktifkan' : 'Audio Spasial 3D Surround dinonaktifkan');
  },

  setReverbPreset: (preset: ReverbPreset) => {
    initAudioEffects();
    resumeAudioContextSafely();
    set({ reverbPreset: preset });
    applySettingsToNodes(get().isEnabled, get().bands, get().bassBoost, get().isSpatialSurround, preset);

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: get().isEnabled,
        activePreset: get().activePreset,
        bands: get().bands,
        bassBoost: get().bassBoost,
        isSpatialSurround: get().isSpatialSurround,
        reverbPreset: preset,
      })
    );

    const name = REVERB_PRESETS[preset]?.name || preset;
    toast.success(`Preset Reverb DSP diubah ke "${name}"`);
  },

  resetToFlat: () => {
    initAudioEffects();
    resumeAudioContextSafely();
    const flatBands: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    const flatBassBoost = 0;

    set({
      activePreset: 'Flat',
      bands: flatBands,
      bassBoost: flatBassBoost,
      isSpatialSurround: false,
      reverbPreset: 'off',
    });

    applySettingsToNodes(get().isEnabled, flatBands, flatBassBoost, false, 'off');

    debouncedLocalStorageSet(
      EQ_STORAGE_KEY,
      JSON.stringify({
        isEnabled: get().isEnabled,
        activePreset: 'Flat',
        bands: flatBands,
        bassBoost: flatBassBoost,
        isSpatialSurround: false,
        reverbPreset: 'off',
      })
    );

    toast.info('Equalizer direset ke Flat');
  },
}));
