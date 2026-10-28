import { NextResponse } from 'next/server';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfterSec: number;
}

interface ClientRecord {
  count: number;
  resetAt: number;
}

/**
 * Lightweight, in-memory sliding-window rate limiter per IP address.
 * Automatically cleans up expired IP entries to prevent memory leaks.
 */
export class InMemoryRateLimiter {
  private records = new Map<string, ClientRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxRequests = 30, windowMs = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
      if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
        this.cleanupInterval.unref();
      }
    }
  }

  check(ip: string): RateLimitResult {
    const now = Date.now();
    let record = this.records.get(ip);

    if (!record || now > record.resetAt) {
      record = {
        count: 1,
        resetAt: now + this.windowMs,
      };
      this.records.set(ip, record);
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        resetTime: record.resetAt,
        retryAfterSec: Math.ceil(this.windowMs / 1000),
      };
    }

    record.count++;
    const remaining = Math.max(0, this.maxRequests - record.count);
    const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));

    return {
      allowed: record.count <= this.maxRequests,
      limit: this.maxRequests,
      remaining,
      resetTime: record.resetAt,
      retryAfterSec,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [ip, record] of this.records.entries()) {
      if (now > record.resetAt) {
        this.records.delete(ip);
      }
    }
  }
}

/**
 * Extracts client IP from incoming Next.js Request headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();

  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim()) return cfConnectingIp.trim();

  return '127.0.0.1';
}

/**
 * Creates standard 429 Too Many Requests response with clean JSON.
 */
export function createRateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    {
      status: false,
      message: `Terlalu banyak permintaan (Rate limit exceeded). Silakan coba lagi dalam ${result.retryAfterSec} detik.`,
      retryAfter: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetTime),
        'Content-Type': 'application/json',
      },
    }
  );
}

// Pre-configured rate limiters
// Stream: 45 requests per 60 seconds (generous for scrubbing/playing, blocks flood abuse)
export const streamLimiter = new InMemoryRateLimiter(45, 60 * 1000);

// Search: 50 requests per 60 seconds (smooth for search inputs with debounce)
export const searchLimiter = new InMemoryRateLimiter(50, 60 * 1000);
