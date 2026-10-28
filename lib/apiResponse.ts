import { NextResponse } from 'next/server';

export interface ApiSuccessPayload<T = any> {
  status: true;
  message: string;
  result: T;
  [key: string]: any;
}

export interface ApiErrorPayload {
  status: false;
  message: string;
  code?: string | number;
  details?: any;
  [key: string]: any;
}

/**
 * Creates a uniform, clean JSON success response conforming to:
 * { status: true, message: '...', result: ... }
 * Also preserves top-level fields for non-array objects for seamless backwards compatibility.
 */
export function createSuccessResponse<T = any>(
  result: T,
  message = 'Request processed successfully',
  statusCode = 200,
  headers: Record<string, string> = {}
): NextResponse<ApiSuccessPayload<T>> {
  const payload: ApiSuccessPayload<T> =
    typeof result === 'object' && result !== null && !Array.isArray(result)
      ? { status: true, message, result, ...(result as Record<string, any>) }
      : { status: true, message, result };

  return NextResponse.json(payload, {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/**
 * Creates a uniform, clean JSON error response conforming to:
 * { status: false, message: '...' }
 * Ensures the backend API never returns raw HTML or crashes on unhandled errors.
 */
export function createErrorResponse(
  message: string,
  statusCode = 500,
  extra: Record<string, any> = {}
): NextResponse<ApiErrorPayload> {
  const payload: ApiErrorPayload = {
    status: false,
    message,
    ...extra,
  };

  return NextResponse.json(payload, {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
