const TAG_PATTERN = /<[^>]*>/g;
const SCRIPT_PROTOCOL_PATTERN = /javascript:/gi;

export function sanitizeString(value: string): string {
  return value.replace(TAG_PATTERN, '').replace(SCRIPT_PROTOCOL_PATTERN, '').trim();
}

export function sanitizeUnknown<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeUnknown(entry)]),
    ) as T;
  }

  return value;
}
