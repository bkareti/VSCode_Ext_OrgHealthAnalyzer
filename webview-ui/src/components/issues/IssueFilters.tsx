import { useIssueStore } from '@/store/slices/issueStore';

const CATEGORIES = [
  'all', 'code-quality', 'automation', 'data-model', 'performance',
  'security', 'testing', 'integration', 'governance', 'technical-debt',
] as const;

const SEVERITIES = ['all', 'error', 'warning', 'info'] as const;

export default function IssueFilters() {
  const filters    = useIssueStore((s) => s.filters);
  const setFilters = useIssueStore((s) => s.setFilters);

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      <input
        type="search"
        placeholder="Search issues…"
        value={filters.search}
        onChange={(e) => setFilters({ search: e.target.value })}
        className="px-2.5 py-1 text-xs rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted focus:border-sf-accent outline-none min-w-40"
      />

      <select
        value={filters.category}
        onChange={(e) => setFilters({ category: e.target.value })}
        className="px-2 py-1 text-xs rounded border border-sf-border bg-sf-bg-3 text-sf-text focus:border-sf-accent outline-none"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c === 'all' ? 'All categories' : c.replace(/-/g, ' ')}</option>
        ))}
      </select>

      <select
        value={filters.severity}
        onChange={(e) => setFilters({ severity: e.target.value })}
        className="px-2 py-1 text-xs rounded border border-sf-border bg-sf-bg-3 text-sf-text focus:border-sf-accent outline-none"
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>{s === 'all' ? 'All severities' : s}</option>
        ))}
      </select>
    </div>
  );
}
