import { NextResponse } from 'next/server';
import { resolveAudioStream, sanitizeVideoId } from '@/lib/audioResolver';
import { audioCache } from '@/lib/audioCache';
import { streamLimiter, getClientIp, createRateLimitResponse } from '@/lib/rateLimit';
import { createErrorResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // 3-minute execution limit for complete song download & MP3 conversion

/**
 * Dedicated Download Endpoint: /api/download?id=<videoId>&title=<title>
 * 
 * Flow:
 * 1. Checks VPS local disk cache (instant delivery with Content-Disposition: attachment)
 * 2. On cache miss: runs yt-dlp to download & transcode full 192K MP3 into VPS disk cache
 * 3. Fallback: if disk caching fails, resolves upstream direct audio stream and proxies with download headers
 * 4. High timeout resilience: 180s runtime window, avoiding premature client timeouts
 */
export async function GET(request: Request) {
  // 1. Rate Limiting Check
  const clientIp = getClientIp(request);
  const rateLimit = streamLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  // 2. Query Parameters & Sanitization
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id') || searchParams.get('videoId') || searchParams.get('url');

  if (!rawId) {
    return createErrorResponse(
      'Parameter "id" wajib disertakan (contoh: /api/download?id=dQw4w9WgXcQ)',
      400
    );
  }

  const videoId = sanitizeVideoId(rawId);
  if (!videoId) {
    return createErrorResponse(
      'Format ID video atau URL YouTube tidak valid. Gunakan 11 karakter ID atau URL YouTube resmi.',
      400
    );
  }

  const rawTitle = searchParams.get('title') || `${videoId}.mp3`;
  const customTitle = rawTitle.endsWith('.mp3') ? rawTitle : `${rawTitle}.mp3`;
  const safeFilename = customTitle.replace(/[/\\?%*:|"<>]/g, '_');

  try {
    // -------------------------------------------------------------
    // Tier 1: Check Server-Side VPS Audio Cache (Instant Hit)
    // -------------------------------------------------------------
    const cachedDisk = audioCache.getCachedAudio(videoId);
    if (cachedDisk) {
      console.info(`[DownloadAPI] ✅ Cache hit on VPS disk for "${videoId}". Serving attachment "${safeFilename}"`);
      return audioCache.serveCachedAudio(request, cachedDisk.filePath, videoId, {
        asAttachment: true,
        filename: safeFilename,
      });
    }

    // -------------------------------------------------------------
    // Tier 2: Cache Miss - Download & Transcode to VPS Disk Cache
    // -------------------------------------------------------------
    if (!videoId.startsWith('itunes:')) {
      try {
        console.info(`[DownloadAPI] ⏳ Cache miss for "${videoId}". Initiating server-side yt-dlp download & caching...`);
        const cachedFilePath = await audioCache.ensureAudioCached(videoId);
        console.info(`[DownloadAPI] ✅ Successfully cached and serving "${videoId}" as "${safeFilename}"`);
        return audioCache.serveCachedAudio(request, cachedFilePath, videoId, {
          asAttachment: true,
          filename: safeFilename,
        });
      } catch (cacheDownloadErr: any) {
        console.error(
          `[DownloadAPI] ❌ VPS disk caching failed for "${videoId}". Falling back to live stream proxy:\n` +
          (cacheDownloadErr?.stack || cacheDownloadErr?.message || cacheDownloadErr)
        );
      }
    }

    // -------------------------------------------------------------
    // Tier 3: Upstream Audio Stream Fallback Proxy
    // -------------------------------------------------------------
    console.info(`[DownloadAPI] 🔄 Resolving direct audio stream fallback for "${videoId}"...`);
    const stream = await resolveAudioStream(videoId);

    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        stream.httpHeaders['User-Agent'] ||
        request.headers.get('user-agent') ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      Accept: '*/*',
    };

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const upstreamResponse = await fetch(stream.url, {
      headers: upstreamHeaders,
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      console.error(
        `[DownloadAPI] ❌ Upstream audio fetch returned status ${upstreamResponse.status} for "${videoId}"`
      );
      return createErrorResponse(
        `Sumber audio upstream mengembalikan status error (${upstreamResponse.status})`,
        502,
        { upstreamStatus: upstreamResponse.status }
      );
    }

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get('content-type') || 'audio/mpeg';
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=14400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
    responseHeaders.set('X-Cache', 'FALLBACK-PROXY');
    responseHeaders.set('X-RateLimit-Remaining', String(rateLimit.remaining));

    const contentRange = upstreamResponse.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    const contentLength = upstreamResponse.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(
      `[DownloadAPI] 🚫 Critical error downloading audio for id "${videoId}":\n` +
      (error?.stack || error?.message || error)
    );
    return createErrorResponse(
      error?.message || 'Proses unduhan file audio gagal atau melebihi batas waktu server.',
      503,
      { videoId, retryable: true, details: error?.message }
    );
  }
}

export async function HEAD(request: Request) {
  const clientIp = getClientIp(request);
  const rateLimit = streamLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(rateLimit.retryAfterSec) },
    });
  }

  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id') || searchParams.get('videoId');

  if (!rawId) {
    return new Response(null, { status: 400 });
  }

  const videoId = sanitizeVideoId(rawId);
  if (!videoId) {
    return new Response(null, { status: 400 });
  }

  const cachedDisk = audioCache.getCachedAudio(videoId);
  if (cachedDisk) {
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(cachedDisk.size));
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    headers.set('X-Cache', 'HIT');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(null, { status: 200, headers });
  }

  return new Response(null, { status: 200 });
}
