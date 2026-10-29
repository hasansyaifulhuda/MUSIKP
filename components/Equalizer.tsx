'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';

export interface EqualizerProps {
  className?: string;
  barClassName?: string;
  isPlaying?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Equalizer = memo(function Equalizer({
  className,
  barClassName,
  isPlaying = true,
  size = 'md',
}: EqualizerProps) {
  const heightClass =
    size === 'sm' ? 'h-3' : size === 'lg' ? 'h-5' : 'h-3.5';

  if (!isPlaying) {
    return (
      <div className={cn('flex gap-0.5 items-end justify-center', heightClass, className)}>
        <div
          style={{ backgroundColor: 'var(--accent-color, #1DB954)' }}
          className={cn('w-0.5 md:w-1 h-1.5 rounded-full', barClassName)}
        />
        <div
          style={{ backgroundColor: 'var(--accent-color, #1DB954)' }}
          className={cn('w-0.5 md:w-1 h-2.5 rounded-full', barClassName)}
        />
        <div
          style={{ backgroundColor: 'var(--accent-color, #1DB954)' }}
          className={cn('w-0.5 md:w-1 h-1 rounded-full', barClassName)}
        />
      </div>
    );
  }

  return (
    <div
      aria-label="Playing equalizer"
      className={cn('flex gap-0.5 items-end justify-center', heightClass, className)}
    >
      <div
        style={{ backgroundColor: 'var(--accent-color, #1DB954)' }}
        className={cn(
          'w-0.5 md:w-1 rounded-full animate-[bounce_0.8s_infinite_0ms]',
          barClassName
        )}
      />
      <div
        style={{ backgroundColor: 'var(--accent-color, #1DB954)' }}
        className={cn(
          'w-0.5 md:w-1 rounded-full animate-[bounce_0.8s_infinite_200ms]',
          barClassName
        )}
      />
      <div
        style={{ backgroundColor: 'var(--accent-color, #1DB954)' }}
        className={cn(
          'w-0.5 md:w-1 rounded-full animate-[bounce_0.8s_infinite_400ms]',
          barClassName
        )}
      />
    </div>
  );
});
