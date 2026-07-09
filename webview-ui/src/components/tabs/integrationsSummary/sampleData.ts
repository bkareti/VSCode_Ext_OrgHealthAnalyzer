import type { RecommendationCardData } from '@/components/common';

/**
 * Literal constants for the Integration Architecture tab, transcribed from
 * the reference mockup. This tab is not yet wired to integrationAnalyzer.ts —
 * every number here is illustrative sample data (see AI_RECOMMENDATION_CARDS'
 * `sample: true` flag, surfaced via the shared AIRecommendations component).
 */

// ─── KPI strip ───────────────────────────────────────────────────────────────
export interface IntegrationKpi {
  icon: string;
  iconBg: string;
  label: string;
  value: number;
  delta: number | null; // null → "No change"
}

export const KPI_CARDS: IntegrationKpi[] = [
  { icon: '📞', iconBg: 'rgba(139,92,246,.15)', label: 'Apex HTTP Callouts',  value: 126, delta: 8 },
  { icon: '🌍', iconBg: 'rgba(20,184,166,.15)', label: 'Apex REST Services',  value: 18,  delta: 3 },
  { icon: '✉️', iconBg: 'rgba(245,158,11,.15)', label: 'Apex SOAP Services',  value: 6,   delta: null },
  { icon: '📢', iconBg: 'rgba(59,130,246,.15)', label: 'Platform Events',     value: 14,  delta: 2 },
  { icon: '🔄', iconBg: 'rgba(236,72,153,.15)', label: 'CDC Enabled Objects', value: 22,  delta: 4 },
  { icon: '🔑', iconBg: 'rgba(20,184,166,.15)', label: 'Named Credentials',   value: 17,  delta: 1 },
  { icon: '🔗', iconBg: 'rgba(59,130,246,.15)', label: 'Connected Apps',      value: 31,  delta: 4 },
  { icon: '🛡️', iconBg: 'rgba(245,158,11,.15)', label: 'Auth Providers',      value: 8,   delta: 1 },
  { icon: '📜', iconBg: 'rgba(139,92,246,.15)', label: 'Certificates',        value: 12,  delta: null },
];

// ─── Technology Distribution / Authentication Landscape donuts ─────────────
export interface DonutLegendRow { name: string; value: number; pct: number }

export const TECHNOLOGY_DISTRIBUTION: DonutLegendRow[] = [
  { name: 'REST API',             value: 28, pct: 32 },
  { name: 'Platform Events',      value: 14, pct: 16 },
  { name: 'Change Data Capture',  value: 12, pct: 14 },
  { name: 'Streaming API',        value: 9,  pct: 10 },
  { name: 'SOAP API',             value: 6,  pct: 7  },
  { name: 'Bulk API',             value: 5,  pct: 6  },
  { name: 'Composite API',        value: 3,  pct: 3  },
  { name: 'GraphQL API',          value: 1,  pct: 1  },
];

export const AUTH_LANDSCAPE: DonutLegendRow[] = [
  { name: 'OAuth 2.0',            value: 28, pct: 48 },
  { name: 'JWT Bearer',           value: 12, pct: 21 },
  { name: 'Named Credential',     value: 8,  pct: 14 },
  { name: 'SAML SSO',             value: 5,  pct: 9  },
  { name: 'Certificate (mTLS)',   value: 3,  pct: 5  },
  { name: 'Basic Auth',           value: 2,  pct: 3  },
];

// ─── Modernization Indicators ───────────────────────────────────────────────
export interface ModernizationIndicator { label: string; used: number; total: number }

export const MODERNIZATION_INDICATORS: ModernizationIndicator[] = [
  { label: 'Uses Named Credentials',    used: 17, total: 58 },
  { label: 'Uses External Credentials', used: 10, total: 58 },
  { label: 'Uses OAuth / JWT',          used: 40, total: 58 },
  { label: 'Uses Platform Events',      used: 14, total: 58 },
  { label: 'Uses CDC',                  used: 22, total: 58 },
  { label: 'Uses REST API',             used: 46, total: 58 },
  { label: 'Uses SOAP API',             used: 6,  total: 58 },
  { label: 'Uses Remote Site Settings', used: 18, total: 58 },
  { label: 'Uses Basic Auth',           used: 2,  total: 58 },
];

// ─── Integration Metadata Inventory ─────────────────────────────────────────
export interface MetadataInventoryItem { icon: string; bg: string; label: string; value: number }

export const METADATA_INVENTORY: MetadataInventoryItem[] = [
  { icon: '🔑', bg: 'rgba(20,184,166,.15)', label: 'Named Credentials',     value: 17 },
  { icon: '🌐', bg: 'rgba(139,92,246,.15)', label: 'External Credentials',  value: 10 },
  { icon: '🔗', bg: 'rgba(59,130,246,.15)', label: 'Connected Apps',        value: 31 },
  { icon: '🛡️', bg: 'rgba(34,197,94,.15)',  label: 'Auth Providers',        value: 8  },
  { icon: '📜', bg: 'rgba(249,115,22,.15)', label: 'Certificates',          value: 12 },
  { icon: '📡', bg: 'rgba(245,158,11,.15)', label: 'Remote Site Settings',  value: 18 },
  { icon: '🧩', bg: 'rgba(236,72,153,.15)', label: 'External Services',     value: 7  },
  { icon: '📢', bg: 'rgba(59,130,246,.15)', label: 'Platform Events',       value: 14 },
  { icon: '🔄', bg: 'rgba(20,184,166,.15)', label: 'CDC Enabled Objects',   value: 22 },
  { icon: '📤', bg: 'rgba(139,92,246,.15)', label: 'Outbound Messages',     value: 5  },
];

// ─── Integration Catalog ────────────────────────────────────────────────────
export type CatalogDirection = 'Outbound' | 'Inbound';

export interface CatalogFilterPill { id: string; label: string; count: number; direction?: CatalogDirection }

export const CATALOG_FILTER_PILLS: CatalogFilterPill[] = [
  { id: 'all',         label: 'All',            count: 58 },
  { id: 'outbound',    label: 'Outbound',       count: 42, direction: 'Outbound' },
  { id: 'inbound',     label: 'Inbound',        count: 16, direction: 'Inbound'  },
  { id: 'eventDriven', label: 'Event Driven',   count: 14 },
  { id: 'batch',       label: 'Batch / Scheduled', count: 8 },
];

export interface CatalogRow {
  name: string;
  type: string;
  technology: string;
  direction: CatalogDirection;
  authentication: string | null;
  authWarning?: boolean;
  endpoint: string;
  usedBy: string;
  status: string;
  lastActivity: string;
}

export const CATALOG_ROWS: CatalogRow[] = [
  { name: 'MuleSoft Customer API', type: 'Apex HTTP Callout',   technology: 'REST API', direction: 'Outbound', authentication: 'OAuth 2.0',  endpoint: 'https://api.mulesoft.com/customer',   usedBy: '5 Apex, 2 Flow',       status: 'Active', lastActivity: '2 hours ago' },
  { name: 'SAP Order Management',  type: 'Apex SOAP Callout',   technology: 'SOAP API', direction: 'Outbound', authentication: 'Basic Auth', authWarning: true, endpoint: 'https://sap.acme.com/soap/OrderService', usedBy: '3 Apex',               status: 'Active', lastActivity: '3 hours ago' },
  { name: 'Invoice Events',        type: 'Platform Event',      technology: 'Platform Events', direction: 'Inbound', authentication: null, endpoint: 'Invoice_Event__e',                     usedBy: '3 Trigger, 1 Flow',    status: 'Active', lastActivity: '15 mins ago' },
  { name: 'Account Change Data',   type: 'Change Data Capture', technology: 'CDC',      direction: 'Inbound',  authentication: null, endpoint: 'AccountChangeEvent',                   usedBy: 'MuleSoft, AWS Lambda', status: 'Active', lastActivity: '10 mins ago' },
  { name: 'Slack Notifications',   type: 'Apex HTTP Callout',   technology: 'REST API', direction: 'Outbound', authentication: 'Webhook',    endpoint: 'https://hooks.slack.com/services/...', usedBy: '2 Flow',               status: 'Active', lastActivity: '1 hour ago' },
];

export const CATALOG_TOTAL_COUNT = 58;

// ─── Integration Implementation / Legacy & Risk Indicators ─────────────────
export interface LabeledCount { label: string; value: number }

export const IMPLEMENTATION_ITEMS: LabeledCount[] = [
  { label: 'Apex Classes using Integrations', value: 86 },
  { label: 'Flows using Integrations',        value: 24 },
  { label: 'Triggers using Integrations',     value: 18 },
  { label: 'Queueable Classes',               value: 12 },
  { label: 'Batch Apex Jobs',                 value: 8  },
  { label: 'Scheduled Jobs',                  value: 9  },
  { label: 'Invocable Actions',               value: 7  },
  { label: 'LWC Components',                  value: 14 },
];

export const RISK_ITEMS: LabeledCount[] = [
  { label: 'Remote Site Settings in Use',        value: 18 },
  { label: 'Hardcoded URLs',                     value: 23 },
  { label: 'Hardcoded Login URLs',               value: 7  },
  { label: 'Basic Authentication',                value: 2  },
  { label: 'SOAP Integrations',                   value: 6  },
  { label: 'Expired Certificates',                value: 2  },
  { label: 'Certificates Expiring (<30 days)',    value: 3  },
  { label: 'Unused Connected Apps',               value: 9  },
];

// ─── Integration Activity Trend (last 12 scans) ─────────────────────────────
export const ACTIVITY_TREND = [
  { month: "Sep '25", outbound: 58, inbound: 38, eventDriven: 12 },
  { month: "Oct '25", outbound: 61, inbound: 41, eventDriven: 14 },
  { month: "Nov '25", outbound: 57, inbound: 36, eventDriven: 16 },
  { month: "Dec '25", outbound: 63, inbound: 44, eventDriven: 15 },
  { month: "Jan '26", outbound: 66, inbound: 42, eventDriven: 18 },
  { month: "Feb '26", outbound: 62, inbound: 47, eventDriven: 20 },
  { month: "Mar '26", outbound: 68, inbound: 45, eventDriven: 19 },
  { month: "Apr '26", outbound: 65, inbound: 49, eventDriven: 22 },
  { month: "May '26", outbound: 70, inbound: 46, eventDriven: 21 },
  { month: "Jun '26", outbound: 67, inbound: 50, eventDriven: 24 },
  { month: "Jul '26", outbound: 72, inbound: 48, eventDriven: 23 },
  { month: "Aug '26", outbound: 69, inbound: 52, eventDriven: 25 },
];

// ─── AI Recommendations (rendered via the shared AIRecommendations component) ─
export const AI_RECOMMENDATION_CARDS: RecommendationCardData[] = [
  {
    id: 'migrate-remote-site-settings',
    icon: '🔀',
    title: 'Migrate to Named Credentials',
    impact: 'High',
    description: 'Migrate 18 integrations using Remote Site Settings to Named Credentials.',
    sample: true,
  },
  {
    id: 'replace-basic-auth',
    icon: '🔐',
    title: 'Replace Basic Authentication',
    impact: 'High',
    description: '2 integrations use Basic Authentication. Replace with OAuth 2.0 / JWT.',
    sample: true,
  },
  {
    id: 'certs-expiring',
    icon: '⚠️',
    title: 'Certificates Expiring Soon',
    impact: 'High',
    description: '3 certificates will expire within 30 days. Renew to avoid outages.',
    sample: true,
  },
  {
    id: 'soap-to-rest',
    icon: '🔄',
    title: 'SOAP-to-REST Candidates',
    impact: 'Medium',
    description: '6 SOAP integrations are good candidates for REST migration.',
    sample: true,
  },
  {
    id: 'unused-platform-events',
    icon: '✅',
    title: 'Review Unused Platform Events',
    impact: 'Low',
    description: '14 Platform Events are defined but not actively used. Review usage.',
    sample: true,
  },
];
