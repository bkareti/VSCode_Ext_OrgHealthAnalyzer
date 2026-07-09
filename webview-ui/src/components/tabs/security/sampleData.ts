/**
 * Every literal constant needed to render the Security tab exactly like the
 * reference mockup when a data concept has no real backend mapping (see
 * derivations.ts for the real, scan-derived counterparts). None of these are
 * demo-mode-only — they render whenever a real scan exists, always tagged
 * with `SampleMark` / a panel's `sample` flag so users can tell which numbers
 * are illustrative vs. detected from their org.
 */

// ─── Password Policy (no PasswordPolicy/SecuritySettings query exists) ─────
export const PASSWORD_POLICY_SAMPLE = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  expirationDays: 90,
  historyCount: 24,
};

// ─── Session Management (no SessionSettings query exists) ──────────────────
export const SESSION_MANAGEMENT_SAMPLE = {
  sessionTimeoutHours: 2,
  idleTimeoutHours: 1,
  concurrentSessions: 3,
  lockOnPasswordChange: true,
  highRiskLogins7d: 12,
};

// ─── IP Restrictions fields with no real source (Login/Trusted IP Ranges are real — see derivations.ts) ──
export const IP_RESTRICTIONS_SAMPLE = {
  loginHoursRestriction: false,
  highRiskIpLogins7d: 6,
};

// ─── Authentication fields with no real source (SSO, Session Timeout, Password Policy label) ──
export const AUTHENTICATION_SAMPLE = {
  ssoEnabled: true,
  sessionTimeoutHours: 2,
  passwordPolicyLabel: 'Strong',
};

// ─── Salesforce Shield Status (no Shield-related query exists anywhere) ────
export const SHIELD_STATUS_SAMPLE = {
  platformEncryption: true,
  fieldAuditTrail: true,
  shieldEventMonitoring: true,
  transactionSecurity: true,
  dataMask: true,
  keyManagement: 'External (BYOK)',
};

// ─── Event Monitoring, Last 7 Days (no LoginEvent/ApiEvent query exists) ───
export const EVENT_MONITORING_SAMPLE = {
  totalEvents: 124_580,
  highRiskEvents: 1_256,
  loginEvents: 18_942,
  apiEvents: 26_815,
  dataAccessEvents: 32_641,
  changeEvents: 18_732,
};

// ─── Connected Apps Security fields with no real source (count + IP-restriction are real — see derivations.ts) ──
export const CONNECTED_APPS_SECURITY_SAMPLE = {
  appsWithRefreshToken: 6,
  highPrivilegeApps: 4,
  unusedApps90d: 3,
  overPrivilegedScopes: 5,
};

// ─── Data Classification Overview (PII field count is real — see derivations.ts) ──
export const DATA_CLASSIFICATION_SAMPLE = {
  dataSensitivityLabels: 28,
  classifiedRecords: 1_200_000,
  sensitiveObjects: 24,
  unclassifiedObjects: 12,
};

// ─── Data Protection Overview fields with no real source (Encrypted Fields total is real — see derivations.ts) ──
export const DATA_PROTECTION_SAMPLE = {
  encryptedFiles: 32,
  platformEncryption: true,
  shieldPlatformEncryption: true,
  dataMask: true,
  eventMonitoring: true,
  auditTrail: true,
};

// ─── Compliance Score (no compliance framework/scoring exists anywhere) ────
export const COMPLIANCE_SAMPLE = {
  score: 91,
  compliantPct: 91,
  warningPct: 6,
  nonCompliantPct: 3,
};
