/**
 * XSS (Cross-Site Scripting) Detection and Prevention Utilities
 *
 * Provides comprehensive XSS payload detection and input sanitization.
 */

const XSS_PATTERNS: RegExp[] = [
  // Script tags
  /<script[^>]*>[\s\S]*?<\/script>/i,
  /<script[^>]*\/>/i,

  // Event handlers
  /\s(on\w+)\s*=\s*["']?[^"'>]+["']?/i,

  // Javascript protocols
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /data:application\/xhtml/i,

  // iframe / object / embed
  /<iframe[^>]*>[\s\S]*?<\/iframe>/i,
  /<object[^>]*>[\s\S]*?<\/object>/i,
  /<embed[^>]*\/?>/i,

  // SVG with scripts
  /<svg[^>]*>[\s\S]*?<script[\s\S]*?<\/script>[\s\S]*?<\/svg>/i,

  // HTML entities that decode to dangerous chars
  /&#[xX]?[0-9a-fA-F]+;/,

  // Expression / behavior (IE)
  /expression\s*\(/i,
  /behavior\s*:\s*url/i,

  // Template injection
  /\{\{.*?\}\}/,
  /\$\{.*?\}/,

  // Base64 encoded script patterns (common prefixes)
  /PHNjcmlwd/i, // base64 of '<script'

  // Form action hijacking
  /<form[^>]*action\s*=\s*["']?javascript:/i,

  // Meta refresh with JS
  /<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*url\s*=\s*["']?javascript:/i,

  // Link with JS protocol
  /<a[^>]*href\s*=\s*["']?javascript:/i,

  // Background / style with JS
  /background\s*:\s*url\s*\(\s*["']?javascript:/i,
];

/**
 * Check if a string contains potential XSS payload patterns.
 */
export function containsXssPayload(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const normalized = decodeHtmlEntities(decodeURIComponent(value));
  return XSS_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Sanitize a string by removing HTML tags and encoding dangerous characters.
 */
export function sanitizeXss(value: string): string {
  if (!value || typeof value !== 'string') return value;

  return (
    value
      // Remove script tags and contents
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove other dangerous tags
      .replace(/<(iframe|object|embed|form|meta|link|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(iframe|object|embed|input|button)[^>]*\/?>/gi, '')
      // Remove event handlers
      .replace(/\s(on\w+)\s*=\s*["']?[^"'>]*["']?/gi, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      // Encode remaining angle brackets
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Encode quotes
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
  );
}

/**
 * Deep sanitize an object by applying XSS sanitization to all string values.
 */
export function deepSanitizeXss<T>(obj: T): T {
  if (typeof obj === 'string') {
    return sanitizeXss(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepSanitizeXss(item)) as T;
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepSanitizeXss(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Decode common HTML entities to reveal obfuscated XSS.
 */
function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#x27;': "'",
    '&#39;': "'",
    '&#34;': '"',
    '&apos;': "'",
  };

  let decoded = value;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Decode numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return decoded;
}

/**
 * Scan an object for XSS payloads and return findings.
 */
export function scanForXss(
  obj: unknown,
  path = '',
): Array<{ path: string; value: string; pattern: string }> {
  const findings: Array<{ path: string; value: string; pattern: string }> = [];

  if (typeof obj === 'string') {
    const normalized = decodeHtmlEntities(decodeURIComponent(obj));
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(normalized)) {
        findings.push({ path, value: obj, pattern: pattern.source });
        break;
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      findings.push(...scanForXss(obj[i], `${path}[${i}]`));
    }
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      findings.push(...scanForXss(value, newPath));
    }
  }

  return findings;
}
