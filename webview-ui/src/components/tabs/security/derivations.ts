import type { ScanHistoryEntry, ConnectedAppInfo, ProfileIpRangeInfo } from '@/types';

/**
 * Pure functions computing every REAL number shown on the Security tab from
 * `AnalysisResult` fields. Nothing here fabricates a value that isn't
 * traceable to a real field — concepts with no backend mapping stay in
 * sampleData.ts instead.
 */

export type SecuritySubTab =
  | 'overview'
  | 'identity'
  | 'authentication'
  | 'dataProtection'
  | 'eventMonitoring'
  | 'risks'
  | 'compliance'
  | 'shieldEncryption';

export const SUB_TABS: { id: SecuritySubTab; label: string }[] = [
  { id: 'overview',        label: 'Overview' },
  { id: 'identity',        label: 'Identity & Access' },
  { id: 'authentication',  label: 'Authentication' },
  { id: 'dataProtection',  label: 'Data Protection' },
  { id: 'eventMonitoring', label: 'Event Monitoring' },
  { id: 'risks',           label: 'Security Risks' },
  { id: 'compliance',      label: 'Compliance' },
  { id: 'shieldEncryption', label: 'Shield & Encryption' },
];

export const SEC_CATS = ['security', 'profile-security', 'user-governance'];

export function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString() : '—';
}

export function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—';
}

export function mapRiskCategory(category: string, message: string): string {
  if (category === 'profile-security') return 'Access Management';
  if (category === 'user-governance')  return 'User Governance';
  const m = message.toLowerCase();
  if (m.includes('auth') || m.includes('sso') || m.includes('mfa') || m.includes('login')) return 'Authentication';
  if (m.includes('shar') || m.includes('owd') || m.includes('public group'))               return 'Sharing Risks';
  if (m.includes('encrypt') || m.includes('sensitive') || m.includes('pii'))               return 'Data Exposure';
  if (m.includes('config') || m.includes('setting') || m.includes('policy'))               return 'Configuration Issues';
  return 'Other Risks';
}

/** Change vs. the previous scan for a numeric field on ScanHistoryEntry. History is stored oldest→newest and its last entry is the current scan. */
export function kpiDelta(history: ScanHistoryEntry[], pick: (e: ScanHistoryEntry) => number | undefined): number | undefined {
  if (history.length < 2) return undefined;
  const current = pick(history[history.length - 1]);
  const previous = pick(history[history.length - 2]);
  return current != null && previous != null ? current - previous : undefined;
}

/** Sparkline points across scan history for a numeric field. Never fabricates points — returns [] when there's no real history. */
export function kpiSparkline(history: ScanHistoryEntry[], pick: (e: ScanHistoryEntry) => number | undefined): { value: number }[] {
  return history
    .map((e) => pick(e))
    .filter((v): v is number => v != null)
    .map((value) => ({ value }));
}

/** Sum of classic (non-Shield) EncryptedText fields across every analyzed object. */
export function encryptedFieldsTotal(dataModelStats: { fieldTypes: Record<string, number> }[] | undefined): number {
  return (dataModelStats ?? []).reduce((sum, obj) => sum + (obj.fieldTypes?.EncryptedText ?? 0), 0);
}

/** Connected Apps whose IpRelaxation is anything other than 'Relaxed' (i.e. IP-restricted). */
export function ipRestrictedConnectedAppsCount(apps: ConnectedAppInfo[] | undefined): number {
  return (apps ?? []).filter((a) => !!a.ipRelaxation && a.ipRelaxation !== 'Relaxed').length;
}

/** Profiles that carry at least one Login IP Range restriction. */
export function profilesWithLoginIpRangeCount(ranges: ProfileIpRangeInfo[] | undefined): number {
  return (ranges ?? []).filter((r) => r.rangeCount > 0).length;
}
