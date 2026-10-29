import { create } from 'zustand';
import { debouncedLocalStorageGet, debouncedLocalStorageSet } from './debouncedStorage';
import { toast } from './toast';

/**
 * Enterprise Battery Saver & Low-Power Mode Integration
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 74)
 *
 * Guarantees:
 * 1. Proactive hardware battery telemetry via W3C Battery Status API.
 * 2. Automatic low-power activation when device reaches <= 20% on battery.
 * 3. Manual user override switch in Settings.
 * 4. DOM attribute reflection (data-low-power="true") to throttle canvas animations & CSS blur.
 */

const BATTERY_SAVER_STORAGE_KEY = 'pmusic_battery_saver_mode_v1';

export interface BatteryState {
  batteryLevel: number | null; // 0.0 to 1.0 (e.g. 0.85 = 85%)
  isCharging: boolean | null;
  isAutoLowPower: boolean; // Auto-triggered by <= 20%
  isManualSaver: boolean; // Explicitly forced by user
  isLowPowerActive: boolean; // Effective status (auto || manual)

  initBatteryListener: () => void;
  toggleManualSaver: () => void;
  setManualSaver: (enabled: boolean) => void;
}

function applyLowPowerDomAttribute(active: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (active) {
    root.setAttribute('data-low-power', 'true');
    root.classList.add('low-power-mode');
  } else {
    root.removeAttribute('data-low-power');
    root.classList.remove('low-power-mode');
  }
}

function getInitialManualSaver(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return debouncedLocalStorageGet(BATTERY_SAVER_STORAGE_KEY) === 'true';
  } catch {}
  return false;
}

export const useBatteryStore = create<BatteryState>((set, get) => ({
  batteryLevel: null,
  isCharging: null,
  isAutoLowPower: false,
  isManualSaver: getInitialManualSaver(),
  isLowPowerActive: getInitialManualSaver(),

  initBatteryListener: () => {
    if (typeof window === 'undefined') return;

    // Check initial DOM state
    applyLowPowerDomAttribute(get().isLowPowerActive);

    if ('getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          const update = () => {
            const level = battery.level;
            const charging = battery.charging;
            const autoLow = level <= 0.2 && !charging;
            const manual = get().isManualSaver;
            const effective = autoLow || manual;

            set({
              batteryLevel: level,
              isCharging: charging,
              isAutoLowPower: autoLow,
              isLowPowerActive: effective,
            });

            applyLowPowerDomAttribute(effective);
          };

          update();

          battery.addEventListener('levelchange', update);
          battery.addEventListener('chargingchange', update);
        })
        .catch(() => {});
    }
  },

  toggleManualSaver: () => {
    const next = !get().isManualSaver;
    get().setManualSaver(next);
  },

  setManualSaver: (enabled: boolean) => {
    const autoLow = get().isAutoLowPower;
    const effective = enabled || autoLow;

    set({
      isManualSaver: enabled,
      isLowPowerActive: effective,
    });

    applyLowPowerDomAttribute(effective);
    debouncedLocalStorageSet(BATTERY_SAVER_STORAGE_KEY, String(enabled));

    if (enabled) {
      toast.success('Mode Hemat Daya diaktifkan (Visualizer & animasi diredam)');
    } else {
      toast.info('Mode Hemat Daya dinonaktifkan');
    }
  },
}));
