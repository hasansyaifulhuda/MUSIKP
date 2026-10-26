'use client';

import React, { memo, useRef, useEffect, useState } from 'react';

interface MarqueeTextProps {
  text: React.ReactNode;
  className?: string;
  enabled?: boolean;
}

export const MarqueeText = memo(function MarqueeText({
  text,
  className = '',
  enabled = true,
}: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsOverflowing(false);
      return;
    }

    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    let rafId: number;
    const checkOverflow = () => {
      if (container && textEl) {
        const overflows = textEl.scrollWidth > container.clientWidth + 2;
        setIsOverflowing((prev) => (prev !== overflows ? overflows : prev));
      }
    };

    rafId = requestAnimationFrame(checkOverflow);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(checkOverflow);
      });
      observer.observe(container);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
    };
  }, [text, enabled]);

  if (!enabled) {
    return (
      <div className={`overflow-hidden text-ellipsis whitespace-nowrap ${className}`}>
        {text}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap gpu-accelerated ${className}`}>
      <div className={isOverflowing ? 'animate-marquee flex min-w-full' : 'inline-block w-full'}>
        <span ref={textRef} className="shrink-0 inline-flex items-center gap-1">
          {text}
        </span>
        {isOverflowing && (
          <span className="shrink-0 pl-8 inline-flex items-center gap-1" aria-hidden="true">
            {text}
          </span>
        )}
      </div>
    </div>
  );
});
