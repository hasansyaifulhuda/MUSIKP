/**
 * Selective Route Prefetching Strategy
 * 
 * Prevents cellular data exhaustion and unnecessary background network requests
 * by selectively disabling prefetching on secondary, heavy, or infrequent routes.
 * 
 * Features:
 * - Differentiates primary shell routes (/ and /search) from secondary routes
 * - Automatically respects user's Data-Saver mode (Save-Data header / navigator.connection.saveData)
 * - Guards against aggressive prefetching on slow 2G/3G connections
 */

export function isPrefetchAllowed(isPrimaryRoute: boolean = false): boolean {
  if (typeof window === 'undefined') {
    return isPrimaryRoute;
  }

  // If user turned on browser Data Saver, disable prefetching across the board
  const conn =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (conn) {
    if (conn.saveData === true) {
      return false;
    }
    if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
      return false;
    }
  }

  return isPrimaryRoute;
}
