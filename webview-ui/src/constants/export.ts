export const EXPORT_FORMATS = [
  { id: 'html',      label: 'HTML Report',     desc: 'Full dashboard as a standalone HTML file' },
  { id: 'json',      label: 'JSON Data',        desc: 'Structured export for integrations and CI/CD' },
  { id: 'architect', label: 'Architect Report', desc: 'Executive summary for architecture review' },
  { id: 'sarif',     label: 'SARIF',            desc: 'Standard format for code scanning tools' },
] as const;

export type ExportFormat = typeof EXPORT_FORMATS[number]['id'];
