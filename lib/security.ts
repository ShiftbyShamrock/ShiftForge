/**
 * Security utilities for SHIFT Forge.
 * Provides rate limiting, SSRF defense, client IP extraction, and input sanitization.
 */

import { PublicKey } from '@solana/web3.js';

// ── Rate Limiting (Sliding Window in Memory) ──────────────────────────────────
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit records every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetSeconds: number;
}

/**
 * Checks and increments the rate limit for a given key (e.g. `ip:endpoint`).
 *
 * @param key Identifier for the client + endpoint
 * @param maxRequests Maximum allowed requests in the window
 * @param windowMs Window duration in milliseconds (default 60s)
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxRequests - 1, resetSeconds: Math.ceil(windowMs / 1000) };
  }

  if (record.count >= maxRequests) {
    const resetSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { limited: true, remaining: 0, resetSeconds };
  }

  record.count += 1;
  const resetSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  return { limited: false, remaining: maxRequests - record.count, resetSeconds };
}

/**
 * Safely extracts client IP address from Next.js request headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();
  return '127.0.0.1';
}

// ── SSRF Defense ─────────────────────────────────────────────────────────────

/**
 * Validates that an image URL is safe to fetch server-side:
 * - Must use HTTPS (or HTTP only if explicitly permitted, strictly external)
 * - Must not target localhost, loopback, or private RFC 1918 networks
 * - Must not target cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 * - Must not use dangerous ports
 */
export function isSafeExternalImageUrl(urlString: string): { safe: boolean; reason?: string; url?: URL } {
  if (!urlString || typeof urlString !== 'string') {
    return { safe: false, reason: 'URL must be a non-empty string' };
  }

  if (urlString.length > 2048) {
    return { safe: false, reason: 'URL exceeds maximum length' };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Only allow HTTPS protocol for security (or HTTP for known public gateways if necessary)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  // Enforce standard web ports
  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    return { safe: false, reason: 'Non-standard port is not permitted' };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Block localhost and loopback hostnames
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { safe: false, reason: 'Localhost and internal hostnames are blocked' };
  }

  // Block Cloud metadata hosts
  if (
    hostname === '169.254.169.254' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data' ||
    hostname === 'metadata'
  ) {
    return { safe: false, reason: 'Cloud metadata access is blocked' };
  }

  // Check for IPv4 addresses
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const [, aStr, bStr, cStr, dStr] = ipMatch;
    const a = parseInt(aStr, 10);
    const b = parseInt(bStr, 10);

    // 0.0.0.0/8
    if (a === 0) return { safe: false, reason: 'Current network IP blocked' };
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return { safe: false, reason: 'Loopback IP blocked' };
    // 10.0.0.0/8 (Private)
    if (a === 10) return { safe: false, reason: 'Private IP (10.x) blocked' };
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return { safe: false, reason: 'Private IP (172.16-31.x) blocked' };
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return { safe: false, reason: 'Private IP (192.168.x) blocked' };
    // 169.254.0.0/16 (Link-local / AWS metadata)
    if (a === 169 && b === 254) return { safe: false, reason: 'Link-local IP blocked' };
    // 224.0.0.0/4 (Multicast / Reserved)
    if (a >= 224) return { safe: false, reason: 'Multicast or reserved IP blocked' };
  }

  // Block IPv6 loopback / private
  if (
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('fc00:') ||
    hostname.startsWith('fe80:')
  ) {
    return { safe: false, reason: 'IPv6 private/loopback blocked' };
  }

  return { safe: true, url: parsed };
}

// ── Public Key & Solana Sanitization ──────────────────────────────────────────
export function isValidSolanaAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) {
    return false;
  }
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ── HTML / Text Sanitization Helper ──────────────────────────────────────────
export function sanitizeText(input: unknown, maxLen = 2000): string {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, maxLen)
    .replace(/[<>'"&]/g, (char) => {
      switch (char) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case "'": return '&#39;';
        case '"': return '&quot;';
        case '&': return '&amp;';
        default: return char;
      }
    });
}
