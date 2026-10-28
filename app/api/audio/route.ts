import { GET as streamGET, HEAD as streamHEAD } from '../stream/route';

export const dynamic = 'force-dynamic';

// Backwards-compatible alias for /api/stream
export const GET = streamGET;
export const HEAD = streamHEAD;
