import { useMemo, useState } from 'react';
import type { Issue } from '@/types';
import { useIssueStore } from '@/store/slices/issueStore';
import { cn } from '@/lib/cn';
import { SEV_ORDER, SEV_COLOR, PAGE_SIZE } from '@/constants/severity';
import { SeverityPill, Pagination } from '@/components/common';

type SortKey = 'severity' | 'category' | 'message' | 'file';
type SortDir  = 'asc' | 'desc';

const COLS: { key: SortKey; label: string; className: string }[] = [
  { key: 'severity', label: 'Severity', className: 'w-24' },
  { key: 'message',  label: 'Message',  className: 'flex-1 min-w-0' },
  { key: 'category', label: 'Category', className: 'w-32' },
  { key: 'file',     label: 'Location', className: 'w-44' },
];

interface Props {
  issues: Issue[];
  hideFilters?: boolean;
}

export default function IssueTable({ issues, hideFilters }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('severity');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage]       = useState(1);

  const filters   = useIssueStore((s) => s.filters);
  const openDrill = useIssueStore((s) => s.openDrill);

  const filtered = useMemo(() => {
    if (hideFilters) return issues;
    let list = issues;
    if (filters.category !== 'all') list = list.filter((i) => i.category === filters.category);
    if (filters.severity  !== 'all') list = list.filter((i) => i.severity  === filters.severity);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((i) =>
        i.message.toLowerCase().includes(q) || (i.file ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [issues, filters, hideFilters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'severity') cmp = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      if (sortKey === 'message')  cmp = a.message.localeCompare(b.message);
      if (sortKey === 'category') cmp = a.category.localeCompare(b.category);
      if (sortKey === 'file')     cmp = (a.file ?? '').localeCompare(b.file ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  if (sorted.length === 0) {
    return <p className="text-xs text-sf-muted py-6 text-center">No issues match the current filters.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-sf-border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-sf-bg-3 border-b border-sf-border">
              {COLS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    col.className,
                    'px-3 py-2 text-left text-sf-muted font-medium cursor-pointer select-none',
                    'hover:text-sf-text transition-colors whitespace-nowrap'
                  )}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((issue, rowIdx) => {
              const issueIdx = (page - 1) * PAGE_SIZE + rowIdx;
              return (
                <tr
                  key={`${issue.id}-${issueIdx}`}
                  onClick={() => openDrill(issueIdx, issue)}
                  className="border-b border-sf-border/40 hover:bg-sf-bg-3/50 cursor-pointer transition-colors"
                  style={{ borderLeft: `2px solid ${SEV_COLOR[issue.severity]}` }}
                >
                  <td className="px-3 py-2"><SeverityPill severity={issue.severity} /></td>
                  <td className="px-3 py-2 text-sf-text max-w-0">
                    <span className="block truncate" title={issue.message}>{issue.message}</span>
                  </td>
                  <td className="px-3 py-2 text-sf-muted capitalize whitespace-nowrap">
                    {issue.category.replace(/-/g, ' ')}
                  </td>
                  <td className="px-3 py-2 text-sf-muted max-w-0">
                    <span className="block truncate font-mono text-[10px]" title={issue.file}>
                      {issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onChange={setPage} />
    </div>
  );
}
