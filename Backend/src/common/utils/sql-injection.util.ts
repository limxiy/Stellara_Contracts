/**
 * SQL Injection Detection and Prevention Utilities
 *
 * Provides pattern-based detection of common SQL injection attacks.
 * These are defense-in-depth measures; parameterized queries remain the primary defense.
 */

const SQL_INJECTION_PATTERNS: RegExp[] = [
  // Union-based attacks
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
  /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
  /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,

  // Union select
  /((\%27)|(\'))union/i,
  /union((\%27)|(\'))/i,
  /union\s+select/i,
  /union\s+all\s+select/i,

  // Stacked queries
  /;\s*\w+/i,
  /;\s*(drop|delete|insert|update|create|alter|exec|execute)/i,

  // Comment-based
  /\/\*/,
  /\*\//,
  /--/,
  /#/,

  // Boolean-based / time-based
  /(\%27)|(\')\s*or\s*(\%27)|(\')/i,
  /(\%27)|(\')\s*and\s*(\%27)|(\')/i,
  /\d\s*or\s*\d\s*=\s*\d/i,
  /\d\s*and\s*\d\s*=\s*\d/i,
  /waitfor\s+delay/i,
  /benchmark\s*\(/i,
  /sleep\s*\(/i,

  // Error-based
  /convert\s*\(/i,
  /cast\s*\(/i,

  // Dangerous functions
  /xp_cmdshell/i,
  /sp_oamethod/i,
  /sp_oacreate/i,
  /into\s+outfile/i,
  /into\s+dumpfile/i,

  // Hex/char encoding
  /0x[0-9a-f]+/i,
  /char\s*\(\s*\d+/i,
];

/**
 * Check if a string contains potential SQL injection patterns.
 * Returns true if suspicious patterns are found.
 */
export function containsSqlInjection(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const normalized = decodeURIComponent(value);
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Sanitize a string by escaping SQL special characters.
 * Note: This is a last-resort measure. Always use parameterized queries.
 */
export function escapeSqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\x00/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
}

/**
 * Deep scan an object for SQL injection patterns.
 * Returns an array of paths where injections were found.
 */
export function scanForSqlInjection(
  obj: unknown,
  path = '',
): Array<{ path: string; value: string; pattern: string }> {
  const findings: Array<{ path: string; value: string; pattern: string }> = [];

  if (typeof obj === 'string') {
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(obj)) {
        findings.push({ path, value: obj, pattern: pattern.source });
        break;
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      findings.push(...scanForSqlInjection(obj[i], `${path}[${i}]`));
    }
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      findings.push(...scanForSqlInjection(value, newPath));
    }
  }

  return findings;
}

/**
 * Strip SQL comment sequences from a string.
 */
export function stripSqlComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/#[^\n]*/g, '');
}
