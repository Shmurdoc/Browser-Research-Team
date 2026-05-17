// ============================================================
// URL Validation — Protocol Allowlist, SSRF Prevention
// ============================================================

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '0.0.0.0',
  'metadata.google.internal',
  '169.254.169.254',
  'metadata.azure.com',
  '100.100.100.200',
]);

/**
 * Validate a URL against allowlist protocols and blocklist hosts.
 * Returns false for javascript:, data:, file:, vbscript: protocols
 * and for private/internal IP addresses (SSRF prevention).
 */
export function validateURL(input: string): boolean {
  if (!input || typeof input !== 'string') return false;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }

  // Check protocol allowlist
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;

  // Check blocked hosts (SSRF prevention)
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) return false;

  // Block private IP ranges (SSRF prevention)
  if (isPrivateIP(hostname)) return false;

  return true;
}

/**
 * Check if a hostname is a private/internal IP address.
 */
function isPrivateIP(hostname: string): boolean {
  // IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
  }

  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;

  // IPv6 unique local (fc00::/7)
  if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;

  return false;
}

/**
 * Sanitize a URL for safe display — strips dangerous protocols.
 * Returns empty string if the URL is unsafe.
 */
export function sanitizeURL(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Block dangerous protocols
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return '';
  }

  // Only allow http/https
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('//')) {
    return trimmed;
  }

  // Relative URLs are ok for display
  if (!lower.includes(':')) {
    return trimmed;
  }

  return '';
}
