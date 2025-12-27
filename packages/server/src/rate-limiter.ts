import type { WebSocket } from 'ws';

/**
 * Token Bucket Rate Limiter
 * 
 * Prevents any single client from overwhelming the server.
 * Uses WeakMap so buckets are garbage collected when connections close.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

// Rate limit configuration
const DRAW_BUCKET_SIZE = 30;      // Max burst of 30 draw events
const DRAW_REFILL_RATE = 60;      // Refill 60 tokens per second

const CURSOR_BUCKET_SIZE = 60;    // Max burst of 60 cursor moves
const CURSOR_REFILL_RATE = 120;   // Refill 120 tokens per second

// Per-connection buckets (WeakMap for automatic cleanup)
const drawBuckets = new WeakMap<WebSocket, Bucket>();
const cursorBuckets = new WeakMap<WebSocket, Bucket>();

/**
 * Get or create a bucket for a connection
 */
function getBucket(
  ws: WebSocket,
  buckets: WeakMap<WebSocket, Bucket>,
  maxTokens: number
): Bucket {
  let bucket = buckets.get(ws);
  if (!bucket) {
    bucket = { tokens: maxTokens, lastRefill: Date.now() };
    buckets.set(ws, bucket);
  }
  return bucket;
}

/**
 * Refill tokens based on elapsed time
 */
function refillBucket(bucket: Bucket, refillRate: number, maxTokens: number): void {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000; // seconds
  const tokensToAdd = elapsed * refillRate;
  
  bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Try to consume a token from the bucket
 * Returns true if allowed, false if rate limited
 */
function tryConsume(
  ws: WebSocket,
  buckets: WeakMap<WebSocket, Bucket>,
  refillRate: number,
  maxTokens: number
): boolean {
  const bucket = getBucket(ws, buckets, maxTokens);
  refillBucket(bucket, refillRate, maxTokens);
  
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  
  return false;
}

// Track rate limit hits for logging (avoid spam by throttling logs)
let lastDrawLogTime = 0;
let lastCursorLogTime = 0;
const LOG_THROTTLE_MS = 1000; // Only log once per second per type

/**
 * Check if a draw event is allowed for this connection
 * Returns true if allowed, false if rate limited
 */
export function checkDrawLimit(ws: WebSocket): boolean {
  const allowed = tryConsume(ws, drawBuckets, DRAW_REFILL_RATE, DRAW_BUCKET_SIZE);
  if (!allowed) {
    const now = Date.now();
    if (now - lastDrawLogTime > LOG_THROTTLE_MS) {
      console.log('[RateLimit] DRAW_EVENT dropped - client exceeded 60/sec limit');
      lastDrawLogTime = now;
    }
  }
  return allowed;
}

/**
 * Check if a cursor move is allowed for this connection
 * Returns true if allowed, false if rate limited
 */
export function checkCursorLimit(ws: WebSocket): boolean {
  const allowed = tryConsume(ws, cursorBuckets, CURSOR_REFILL_RATE, CURSOR_BUCKET_SIZE);
  if (!allowed) {
    const now = Date.now();
    if (now - lastCursorLogTime > LOG_THROTTLE_MS) {
      console.log('[RateLimit] CURSOR_MOVE dropped - client exceeded 120/sec limit');
      lastCursorLogTime = now;
    }
  }
  return allowed;
}

