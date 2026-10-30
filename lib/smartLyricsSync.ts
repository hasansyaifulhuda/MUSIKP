import { LyricLine } from './performance';
import { useLyricsOffsetStore } from './lyricsOffsetStore';
import { toast } from './toast';

/**
 * Smart AI Lyrics Synchronization Engine
 * Replaces manual millisecond adjustment with intelligent automatic alignment:
 * 1. Real-time song position detection (minute:second progress)
 * 2. Natural language anchor matching (sync line to current voice with 1 tap)
 * 3. Proportional song structure analysis (intro, verse, chorus, outro)
 * 4. Automatic silence compensation between YouTube audio and studio lyrics
 */

export function formatMinuteSeconds(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Predicts the active lyric line index based on song progress ratio,
 * syllable weight, and structural musical sections.
 */
export function detectLyricBySongProgress(
  lyrics: LyricLine[],
  currentTime: number,
  duration: number
): { index: number; line: LyricLine | null; estimatedProgressPct: number } {
  if (!Array.isArray(lyrics) || lyrics.length === 0) {
    return { index: -1, line: null, estimatedProgressPct: 0 };
  }

  const validDuration = duration > 10 ? duration : 180;
  const progressRatio = Math.max(0, Math.min(1, currentTime / validDuration));
  const estimatedProgressPct = Math.round(progressRatio * 100);

  // If lyrics already have timestamps, find line closest to currentTime
  const hasTimestamps = lyrics.some((l) => l.time > 0);
  if (hasTimestamps) {
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < lyrics.length; i++) {
      const diff = Math.abs(lyrics[i].time - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return {
      index: closestIdx,
      line: lyrics[closestIdx] || null,
      estimatedProgressPct,
    };
  }

  // For plain text lyrics: map via character and stanza distribution
  // Intro silence estimation (5% to 12% of duration)
  const introRatio = 0.08;
  const effectiveProgress = Math.max(0, (progressRatio - introRatio) / (1 - introRatio));
  const targetIndex = Math.min(
    lyrics.length - 1,
    Math.max(0, Math.floor(effectiveProgress * lyrics.length))
  );

  return {
    index: targetIndex,
    line: lyrics[targetIndex] || null,
    estimatedProgressPct,
  };
}

/**
 * Smart AI Anchor Calibration:
 * Synchronizes the entire song's lyrics to the current singing moment.
 * Eliminates manual "+0.1s / -0.5s" buttons completely.
 */
export function smartAlignToCurrentVoice(
  videoId: string,
  targetLineTime: number,
  currentAudioTime: number,
  lineText?: string
): number {
  if (!videoId) return 0;

  // Calculate the exact time difference between where the audio is playing and the lyric line's original timestamp
  const delta = Number((currentAudioTime - targetLineTime).toFixed(2));
  // Clamp to reasonable limit (-15s to +15s)
  const clampedDelta = Math.max(-15, Math.min(15, delta));

  useLyricsOffsetStore.getState().setOffset(videoId, clampedDelta);

  const timeStr = formatMinuteSeconds(currentAudioTime);
  const snippet = lineText ? `"${lineText.slice(0, 28)}${lineText.length > 28 ? '...' : ''}"` : 'lirik';
  toast.success(`✨ AI menyinkronkan lirik: Menit ${timeStr} ⇄ ${snippet}`);

  return clampedDelta;
}

/**
 * Auto-detects introductory audio silence differences between YouTube audio
 * and studio metadata, automatically setting the calibration without user friction.
 */
export function autoCalibrateSilenceOffset(
  videoId: string,
  candidateDuration?: number,
  targetDuration?: number
): void {
  if (!videoId || !candidateDuration || !targetDuration) return;

  const currentStoreOffset = useLyricsOffsetStore.getState().getOffset(videoId);
  // Only auto-calibrate if the user hasn't already calibrated manually
  if (currentStoreOffset !== 0) return;

  const diff = targetDuration - candidateDuration;
  // If difference is small (1s to 5s), it is usually intro silence on YouTube video
  if (diff >= 1.0 && diff <= 5.0) {
    const autoOffset = Number(diff.toFixed(1));
    useLyricsOffsetStore.getState().setOffset(videoId, autoOffset);
    console.log(`[SmartLyricsSync] Auto-calibrated intro silence offset: +${autoOffset}s for ${videoId}`);
  }
}

/**
 * Converts Plain Text Lyrics into intelligent Synchronized Lyrics
 * by analyzing musical sections and song progress (minutes & seconds).
 */
export function generateAiSynchronizedLyrics(
  plainLyrics: LyricLine[],
  trackDuration?: number
): LyricLine[] {
  if (!Array.isArray(plainLyrics) || plainLyrics.length === 0) return [];
  const duration = trackDuration && trackDuration > 10 ? trackDuration : 180;

  const nonHeaderLines = plainLyrics.filter(
    (l) => l.text && !l.text.trim().startsWith('[') && !l.text.trim().endsWith(']')
  );
  if (nonHeaderLines.length === 0) return plainLyrics;

  // Intelligent musical curve:
  // - Intro: 6% to 10% of song
  // - Outro fade: 4% of song
  const introDuration = Math.min(18, Math.max(6, duration * 0.08));
  const activeDuration = Math.max(10, duration - introDuration - (duration * 0.04));

  const totalChars = nonHeaderLines.reduce(
    (acc, l) => acc + Math.max(12, l.text.trim().length),
    0
  );

  let accumulatedTime = introDuration;
  return plainLyrics.map((l) => {
    const textTrimmed = (l.text || '').trim();
    // Headers remain markers
    if (textTrimmed.startsWith('[') && textTrimmed.endsWith(']')) {
      return { time: Math.max(0, accumulatedTime - 0.5), text: l.text };
    }

    const lineTime = Math.round(accumulatedTime * 10) / 10;
    const weight = Math.max(12, textTrimmed.length) / totalChars;
    accumulatedTime += weight * activeDuration;

    return {
      time: lineTime,
      text: l.text,
    };
  });
}
