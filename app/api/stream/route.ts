import { NextResponse } from 'next/server';
import { resolveAudioStream, sanitizeVideoId } from '@/lib/audioResolver';
import { audioCache } from '@/lib/audioCache';
import { streamCache } from '@/lib/cache';
import { streamLimiter, getClientIp, createRateLimitResponse } from '@/lib/rateLimit';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';
import { cookieManager } from '@/lib/cookieRotator';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // 3-minute execution limit for long yt-dlp transcoding and downloading

export async function GET(request: Request) {
  // 1. In-Memory Rate Limiting Layer
  const clientIp = getClientIp(request);
  const rateLimit = streamLimiter.check(clientIp);
  if (!rateLimit.allowed) {
    return createRateLimitResponse(rateLimit);
  }

  // 2. Query Parameter & Sanitization Layer
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id') || searchParams.get('videoId') || searchParams.get('url');

  if (!rawId) {
    return createErrorResponse(
      'Parameter "id" wajib disertakan (contoh: /api/stream?id=dQw4w9WgXcQ)',
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

  const isJsonRequested =
    searchParams.get('format') === 'json' ||
    searchParams.get('json') === 'true' ||
    searchParams.get('info') === 'true' ||
    request.headers.get('accept')?.includes('application/json');

  const isRedirectRequested = searchParams.get('redirect') === 'true';
  const isDownloadRequested = searchParams.get('download') === 'true' || searchParams.get('dl') === 'true';
  const rawTitle = searchParams.get('title') || `${videoId}.mp3`;
  const customTitle = rawTitle.endsWith('.mp3') ? rawTitle : `${rawTitle}.mp3`;

  try {
    // -------------------------------------------------------------
    // Tier 1: Check Server-Side VPS Audio Cache (Instant Hit)
    // -------------------------------------------------------------
    const cachedDisk = audioCache.getCachedAudio(videoId);

    if (cachedDisk) {
      // 1A. JSON Metadata for Cached Audio
      if (isJsonRequested) {
        return createSuccessResponse(
          {
            videoId,
            title: 'Cached Audio Track',
            streamUrl: `/api/stream?id=${encodeURIComponent(videoId)}`,
            format: 'mp3',
            acodec: 'mp3',
            bitrate: 192,
            filesize: cachedDisk.size,
            cached: true,
            source: 'vps-disk',
          },
          'Audio stream resolved from VPS disk cache',
          200,
          {
            'Cache-Control': 'public, s-maxage=86400, max-age=86400',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'HIT',
            'X-Audio-Source': 'vps-disk',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          }
        );
      }

      // 1B. Serve Audio File Directly from VPS Disk (with HTTP Range Seeking & Optional Download Disposition)
      return audioCache.serveCachedAudio(request, cachedDisk.filePath, videoId, {
        asAttachment: isDownloadRequested,
        filename: customTitle,
      });
    }

    // -------------------------------------------------------------
    // Tier 2: Cache Miss - Download & Cache to VPS Disk (if applicable)
    // -------------------------------------------------------------
    // Only attempt disk cache download if not an iTunes lookup ID
    if (!videoId.startsWith('itunes:') && !isJsonRequested && !isRedirectRequested) {
      try {
        const cachedFilePath = await audioCache.ensureAudioCached(videoId);
        return audioCache.serveCachedAudio(request, cachedFilePath, videoId, {
          asAttachment: isDownloadRequested,
          filename: customTitle,
        });
      } catch (cacheDownloadErr: any) {
        console.error(
          `[StreamRoute] ❌ VPS disk caching failed for "${videoId}". Falling back to live stream proxy:\n` +
          (cacheDownloadErr?.stack || cacheDownloadErr?.message || cacheDownloadErr)
        );
        // Fallback to upstream live streaming proxy below
      }
    }

    // -------------------------------------------------------------
    // Tier 3: Upstream Stream Resolution & Live Proxy Streaming
    // -------------------------------------------------------------
    const isMemCached = streamCache.has(videoId);
    const stream = await resolveAudioStream(videoId);

    // If stream URL was successfully resolved, trigger non-blocking disk caching in background
    if (!videoId.startsWith('itunes:')) {
      setTimeout(() => {
        audioCache.ensureAudioCached(videoId).catch(() => {});
      }, 500);
    }

    // 3A. JSON Metadata Response
    if (isJsonRequested) {
      return createSuccessResponse(
        {
          videoId: stream.videoId,
          title: stream.title,
          duration: stream.duration,
          streamUrl: stream.url,
          format: stream.ext,
          acodec: stream.acodec,
          bitrate: stream.abr,
          filesize: stream.filesize,
          cached: isMemCached,
          source: 'upstream-cdn',
        },
        'Audio stream URL resolved successfully',
        200,
        {
          'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': isMemCached ? 'MEM-HIT' : 'MISS',
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        }
      );
    }

    // 3B. 302 Redirection Response
    if (isRedirectRequested) {
      return NextResponse.redirect(stream.url, {
        status: 302,
        headers: {
          'Cache-Control': 'public, s-maxage=7200',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 3C. Live Streaming Proxy Mode (High Resilience & Seeking)
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
        `[StreamRoute] ❌ Upstream audio fetch returned status ${upstreamResponse.status} for id ${videoId}`
      );
      return createErrorResponse(
        `Sumber audio upstream mengembalikan status error (HTTP ${upstreamResponse.status})`,
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        { upstreamStatus: upstreamResponse.status, videoId }
      );
    }

    const rawContentType = upstreamResponse.headers.get('content-type') || '';
    if (rawContentType.includes('text/html') || rawContentType.includes('application/json')) {
      console.error(
        `[StreamRoute] ❌ Upstream returned non-audio content-type "${rawContentType}" for id ${videoId}`
      );
      return createErrorResponse(
        'Sumber audio upstream mengembalikan respons bukan audio (URL kedaluwarsa atau bot check)',
        502,
        { upstreamContentType: rawContentType, videoId }
      );
    }

    if (!upstreamResponse.body) {
      console.error(`[StreamRoute] ❌ Upstream audio stream body is null for id ${videoId}`);
      return createErrorResponse(
        'Data stream audio upstream tidak tersedia atau kosong',
        502,
        { videoId }
      );
    }

    const responseHeaders = new Headers();
    const contentType = rawContentType || 'audio/mp4';
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=14400, stale-while-revalidate=86400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Cache', 'PROXY-STREAM');
    responseHeaders.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    responseHeaders.set('X-Cookie-Active', cookieManager.getPoolStatus().currentActiveFilename || 'standard');

    if (isDownloadRequested) {
      const safeDlName = customTitle.replace(/[/\\?%*:|"<>]/g, '_');
      responseHeaders.set('Content-Disposition', `attachment; filename="${safeDlName}"`);
    }

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
      `[StreamRoute] ❌ Critical error resolving audio for id "${videoId}":\n` +
      (error?.stack || error?.message || error)
    );
    const statusCode =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : error?.code === 'ETIMEDOUT'
        ? 504
        : 500;

    return createErrorResponse(
      error?.message || 'Gagal memproses audio stream: Terkendala koneksi server ke sumber audio.',
      statusCode,
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

  // 1. Fast-Path: Check VPS Disk Cache
  const cachedDisk = audioCache.getCachedAudio(videoId);
  if (cachedDisk) {
    const headers = new Headers();
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(cachedDisk.size));
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Cache', 'HIT');
    headers.set('X-Audio-Source', 'vps-disk');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    return new Response(null, { status: 200, headers });
  }

  // 2. Upstream Metadata Check
  try {
    const stream = await resolveAudioStream(videoId);
    const headers = new Headers();
    headers.set('Content-Type', stream.ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
    headers.set('Accept-Ranges', 'bytes');
    if (stream.filesize) {
      headers.set('Content-Length', String(stream.filesize));
    }
    headers.set('Cache-Control', 'public, max-age=14400');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));

    return new Response(null, { status: 200, headers });
  } catch {
    return new Response(null, { status: 503, headers: { 'Retry-After': '3' } });
  }
}
