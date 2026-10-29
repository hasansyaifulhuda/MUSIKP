'use client';

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Track } from '@/lib/store';
import { TrackItem } from './TrackItem';

export interface VirtualTrackListProps<T = any> {
  tracks?: T[];
  items?: T[];
  queue?: Track[];
  startIndexOffset?: number;
  onRemove?: (track: Track) => void;
  itemHeight?: number; // Average height of TrackItem in px (default 60)
  overscan?: number; // Buffer items above and below visible viewport (default 5)
  threshold?: number; // Minimum items count to activate virtualization (default 15)
  className?: string;
  renderItem?: (item: T, index: number) => React.ReactNode;
}

/**
 * Lightweight, 60fps Zero-Dependency Window Virtualization Component
 * Master Blueprint PMUSIC Architecture - Phase 1.1 (Point 4)
 *
 * Keeps DOM node count minimal (~20-25 items instead of hundreds or thousands),
 * eliminating scroll lag, memory thrashing, and frame drops.
 */
export const VirtualTrackList = memo(function VirtualTrackList<T = any>({
  tracks,
  items,
  queue,
  startIndexOffset = 0,
  onRemove,
  itemHeight = 60,
  overscan = 5,
  threshold = 15,
  className = 'space-y-1',
  renderItem,
}: VirtualTrackListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const rafIdRef = useRef<number | null>(null);

  const listItems: T[] = (tracks || items || []) as T[];

  // If item count is small, bypass virtualization to eliminate measurement overhead
  const shouldVirtualize = listItems.length > threshold;

  const updateScrollPosition = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentWindowScrollY = window.scrollY || document.documentElement.scrollTop;
    const elementTopInDocument = rect.top + currentWindowScrollY;

    // Calculate how far down into the virtual container the user has scrolled
    const relativeScroll = Math.max(0, currentWindowScrollY - elementTopInDocument);
    const winHeight = window.innerHeight || 800;

    setScrollTop(relativeScroll);
    setViewportHeight(winHeight);
  }, []);

  useEffect(() => {
    if (!shouldVirtualize) return;

    const onScrollOrResize = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        updateScrollPosition();
        rafIdRef.current = null;
      });
    };

    // Initial measurement
    updateScrollPosition();

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [shouldVirtualize, updateScrollPosition]);

  // Fallback for short lists
  if (!shouldVirtualize) {
    return (
      <div className={className}>
        {listItems.map((item, i) => {
          const index = startIndexOffset + i;
          const anyItem = item as any;
          if (renderItem) {
            return (
              <React.Fragment key={anyItem?.videoId ? `${anyItem.videoId}-${index}` : index}>
                {renderItem(item, index)}
              </React.Fragment>
            );
          }
          return (
            <TrackItem
              key={anyItem?.videoId ? `${anyItem.videoId}-${index}` : index}
              track={anyItem as Track}
              queue={queue || (listItems as unknown as Track[])}
              index={index}
              onRemove={onRemove}
            />
          );
        })}
      </div>
    );
  }

  // Calculate windowing boundaries
  const totalCount = listItems.length;
  const totalHeight = totalCount * itemHeight;

  const rawStartIndex = Math.floor(scrollTop / itemHeight);
  const rawEndIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight);

  const startIndex = Math.max(0, rawStartIndex - overscan);
  const endIndex = Math.min(totalCount, rawEndIndex + overscan);

  const visibleItems = listItems.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        height: `${totalHeight}px`,
        width: '100%',
      }}
    >
      <div
        style={{
          transform: `translateY(${offsetY}px)`,
          willChange: 'transform',
          width: '100%',
        }}
      >
        {visibleItems.map((item, i) => {
          const actualIndex = startIndex + i;
          const displayIndex = startIndexOffset + actualIndex;
          const anyItem = item as any;

          if (renderItem) {
            return (
              <React.Fragment
                key={anyItem?.videoId ? `${anyItem.videoId}-${actualIndex}` : actualIndex}
              >
                {renderItem(item, displayIndex)}
              </React.Fragment>
            );
          }

          return (
            <TrackItem
              key={anyItem?.videoId ? `${anyItem.videoId}-${actualIndex}` : actualIndex}
              track={anyItem as Track}
              queue={queue || (listItems as unknown as Track[])}
              index={displayIndex}
              onRemove={onRemove}
            />
          );
        })}
      </div>
    </div>
  );
}) as <T = any>(props: VirtualTrackListProps<T>) => React.ReactElement | null;
