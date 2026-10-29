'use client';

import React, { memo } from 'react';
import { AudioVisualizer, AudioVisualizerProps } from './AudioVisualizer';

export interface VisualizerProps extends AudioVisualizerProps {}

/**
 * Production-ready Canvas-based Audio Wave Visualizer
 * Master Blueprint PMUSIC Architecture - Batch 2 (Poin 21)
 *
 * Real-time Web Audio API AnalyserNode integration with 60fps canvas rendering.
 */
export const Visualizer = memo(function Visualizer(props: VisualizerProps) {
  return <AudioVisualizer {...props} />;
});
