import { NextResponse } from 'next/server';
import { resolveAudioStream, sanitizeVideoId } from '@/lib/audioResolver';
import { streamCache } from '@/lib/cache';
import { streamLimiter, getClientIp, createRateLimitResponse } from '@/lib/rateLimit';
import { createErrorResponse, createSuccessResponse } from '@/lib/apiResponse';

export const dynamic = 'force-dynamic';

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

  try {
    const isCached = streamCache.has(videoId);
    const stream = await resolveAudioStream(videoId);

    // 3. JSON Metadata Response
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
          cached: isCached,
        },
        'Audio stream URL resolved successfully',
        200,
        {
          'Cache-Control': 'public, s-maxage=14400, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        }
      );
    }

    // 4. 302 Redirection Response
    if (isRedirectRequested) {
      return NextResponse.redirect(stream.url, {
        status: 302,
        headers: {
          'Cache-Control': 'public, s-maxage=7200',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 5. Audio Streaming Proxy Mode (High Resilience & Seeking)
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
      console.warn(
        `[StreamRoute] Upstream audio fetch returned status ${upstreamResponse.status} for id ${videoId}`
      );
      return createErrorResponse(
        `Upstream media source returned an error (status: ${upstreamResponse.status})`,
        502,
        { upstreamStatus: upstreamResponse.status }
      );
    }

    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get('content-type') || 'audio/mp4';
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=14400, stale-while-revalidate=86400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
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
    console.error(`[StreamRoute] Error resolving audio for id "${videoId}":`, error?.message || error);
    return createErrorResponse(
      error?.message || 'Audio stream sementara tidak dapat diakses untuk lagu ini.',
      503,
      { videoId, retryable: true }
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
    return new Response(null, { status: 500 });
  }
}
