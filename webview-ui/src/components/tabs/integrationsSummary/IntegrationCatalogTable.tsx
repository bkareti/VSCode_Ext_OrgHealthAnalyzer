import { useState } from 'react';
import { GlassCard, Badge, Pagination, Tooltip } from '@/components/common';
import { CATALOG_FILTER_PILLS, CATALOG_ROWS, CATALOG_TOTAL_COUNT } from './sampleData';

const TABLE_HEADERS = [
  'Integration Name', 'Type', 'Technology', 'Direction', 'Authentication',
  'Endpoint / System', 'Used By', 'Status', 'Last Activity', 'Actions',
];

export default function IntegrationCatalogTable() {
  const [activePillId, setActivePillId] = useState('all');
  const [page, setPage] = useState(1);

  const activePill = CATALOG_FILTER_PILLS.find((p) => p.id === activePillId) ?? CATALOG_FILTER_PILLS[0];
  const rows = activePill.direction
    ? CATALOG_ROWS.filter((r) => r.direction === activePill.direction)
    : CATALOG_ROWS;

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-sf-text">Integration Catalog ({CATALOG_TOTAL_COUNT})</h3>
          <Tooltip content="A unified catalog of every integration touchpoint detected across Apex callouts, Platform Events, CDC, and connected metadata.">
            <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search integrations..."
            className="text-xs px-3 py-1.5 rounded-md border border-sf-border bg-sf-bg-2 text-sf-text placeholder:text-sf-muted focus:outline-none focus:ring-1 focus:ring-sf-accent w-48"
          />
          <button type="button" className="px-3 py-1.5 text-xs font-medium rounded-md border border-sf-border bg-sf-bg-2 text-sf-text hover:bg-sf-bg-3 transition-colors">
            🔍 Filters
          </button>
          <button type="button" className="px-3 py-1.5 text-xs font-medium rounded-md border border-sf-border bg-sf-bg-2 text-sf-text hover:bg-sf-bg-3 transition-colors">
            ☰ Columns
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {CATALOG_FILTER_PILLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setActivePillId(p.id); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              activePillId === p.id
                ? 'bg-sf-accent text-white border-sf-accent'
                : 'border-sf-border text-sf-muted hover:text-sf-text hover:bg-sf-bg-3'
            }`}
          >
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-sf-border">
              {TABLE_HEADERS.map((h) => (
                <th key={h} className="text-left py-2 px-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={TABLE_HEADERS.length} className="py-6 text-center text-sf-muted">
                  No sample rows for this filter.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.name} className={`border-b border-sf-border/40 ${i % 2 ? 'bg-sf-bg-3/30' : ''}`}>
                <td className="py-1.5 px-2 text-sf-text font-medium whitespace-nowrap">{r.name}</td>
                <td className="py-1.5 px-2 text-sf-muted whitespace-nowrap">{r.type}</td>
                <td className="py-1.5 px-2 text-sf-muted whitespace-nowrap">{r.technology}</td>
                <td className="py-1.5 px-2 whitespace-nowrap">
                  <span className="font-semibold" style={{ color: r.direction === 'Outbound' ? '#3b82f6' : '#14b8a6' }}>
                    {r.direction === 'Outbound' ? '↑' : '↓'} {r.direction}
                  </span>
                </td>
                <td className="py-1.5 px-2 whitespace-nowrap">
                  {r.authentication == null
                    ? <span className="text-sf-muted">—</span>
                    : r.authWarning
                      ? <Badge variant="error">{r.authentication}</Badge>
                      : <span className="text-sf-text">{r.authentication}</span>}
                </td>
                <td className="py-1.5 px-2 text-sf-muted font-mono truncate max-w-[220px]">{r.endpoint}</td>
                <td className="py-1.5 px-2 text-sf-muted whitespace-nowrap">{r.usedBy}</td>
                <td className="py-1.5 px-2 whitespace-nowrap">
                  <span className="font-semibold" style={{ color: '#22c55e' }}>{r.status}</span>
                </td>
                <td className="py-1.5 px-2 text-sf-muted whitespace-nowrap">{r.lastActivity}</td>
                <td className="py-1.5 px-2 whitespace-nowrap">
                  <button type="button" className="text-sf-muted hover:text-sf-text px-1" aria-label="View">👁️</button>
                  <button type="button" className="text-sf-muted hover:text-sf-text px-1" aria-label="More actions">⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={rows.length || 1} total={activePill.count} onChange={setPage} />
    </GlassCard>
  );
}
