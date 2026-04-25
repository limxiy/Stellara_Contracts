/**
 * Security-relevant event types for audit logging.
 * All events are immutable and retained per compliance policies.
 */
export enum SecurityEventType {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_ISSUED = 'TOKEN_ISSUED',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Session events
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_TERMINATED = 'SESSION_TERMINATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // MFA events
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
  MFA_VERIFIED = 'MFA_VERIFIED',
  MFA_FAILED = 'MFA_FAILED',
  MFA_BACKUP_USED = 'MFA_BACKUP_USED',

  // Authorization events
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REVOKED = 'ROLE_REVOKED',
  ACCESS_GRANTED = 'ACCESS_GRANTED',

  // Data access events
  DATA_EXPORTED = 'DATA_EXPORTED',
  DATA_ACCESSED = 'DATA_ACCESSED',
  DATA_MODIFIED = 'DATA_MODIFIED',
  DATA_DELETED = 'DATA_DELETED',

  // Admin events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_SUSPENDED = 'USER_SUSPENDED',

  // System security events
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  SECURITY_SETTING_CHANGED = 'SECURITY_SETTING_CHANGED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  BRUTE_FORCE_ATTEMPT = 'BRUTE_FORCE_ATTEMPT',

  // Compliance events
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  AUDIT_LOG_ACCESSED = 'AUDIT_LOG_ACCESSED',
}

/**
 * Severity levels for security events
 */
export enum SecurityEventSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Event type to severity mapping
 */
export const EventSeverityMap: Record<SecurityEventType, SecurityEventSeverity> = {
  [SecurityEventType.LOGIN_SUCCESS]: SecurityEventSeverity.INFO,
  [SecurityEventType.LOGIN_FAILURE]: SecurityEventSeverity.WARNING,
  [SecurityEventType.LOGOUT]: SecurityEventSeverity.INFO,
  [SecurityEventType.TOKEN_ISSUED]: SecurityEventSeverity.INFO,
  [SecurityEventType.TOKEN_REFRESHED]: SecurityEventSeverity.INFO,
  [SecurityEventType.TOKEN_REVOKED]: SecurityEventSeverity.WARNING,
  [SecurityEventType.TOKEN_EXPIRED]: SecurityEventSeverity.INFO,
  [SecurityEventType.SESSION_CREATED]: SecurityEventSeverity.INFO,
  [SecurityEventType.SESSION_TERMINATED]: SecurityEventSeverity.INFO,
  [SecurityEventType.SESSION_EXPIRED]: SecurityEventSeverity.INFO,
  [SecurityEventType.MFA_ENABLED]: SecurityEventSeverity.INFO,
  [SecurityEventType.MFA_DISABLED]: SecurityEventSeverity.HIGH,
  [SecurityEventType.MFA_VERIFIED]: SecurityEventSeverity.INFO,
  [SecurityEventType.MFA_FAILED]: SecurityEventSeverity.WARNING,
  [SecurityEventType.MFA_BACKUP_USED]: SecurityEventSeverity.WARNING,
  [SecurityEventType.PERMISSION_DENIED]: SecurityEventSeverity.WARNING,
  [SecurityEventType.ROLE_ASSIGNED]: SecurityEventSeverity.INFO,
  [SecurityEventType.ROLE_REVOKED]: SecurityEventSeverity.INFO,
  [SecurityEventType.ACCESS_GRANTED]: SecurityEventSeverity.INFO,
  [SecurityEventType.DATA_EXPORTED]: SecurityEventSeverity.INFO,
  [SecurityEventType.DATA_ACCESSED]: SecurityEventSeverity.INFO,
  [SecurityEventType.DATA_MODIFIED]: SecurityEventSeverity.INFO,
  [SecurityEventType.DATA_DELETED]: SecurityEventSeverity.HIGH,
  [SecurityEventType.USER_CREATED]: SecurityEventSeverity.INFO,
  [SecurityEventType.USER_UPDATED]: SecurityEventSeverity.INFO,
  [SecurityEventType.USER_DELETED]: SecurityEventSeverity.HIGH,
  [SecurityEventType.USER_SUSPENDED]: SecurityEventSeverity.HIGH,
  [SecurityEventType.CONFIG_CHANGED]: SecurityEventSeverity.WARNING,
  [SecurityEventType.SECURITY_SETTING_CHANGED]: SecurityEventSeverity.HIGH,
  [SecurityEventType.RATE_LIMIT_EXCEEDED]: SecurityEventSeverity.WARNING,
  [SecurityEventType.SUSPICIOUS_ACTIVITY]: SecurityEventSeverity.HIGH,
  [SecurityEventType.BRUTE_FORCE_ATTEMPT]: SecurityEventSeverity.CRITICAL,
  [SecurityEventType.POLICY_VIOLATION]: SecurityEventSeverity.HIGH,
  [SecurityEventType.AUDIT_LOG_ACCESSED]: SecurityEventSeverity.INFO,
};
