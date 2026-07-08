interface Props {
  page: number;          // 1-based
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, total, onChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  // Show up to 7 page buttons, always include first/last
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const start = Math.max(2, page - 2);
    const end   = Math.min(totalPages - 1, page + 2);
    pages.push(1);
    if (start > 2) pages.push('…');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center gap-2 mt-3 text-xs text-sf-muted">
      <span className="mr-1">{from}–{to} of {total}</span>

      <button
        type="button"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className="px-2 py-0.5 rounded border border-sf-border disabled:opacity-30 hover:text-sf-text transition-colors"
      >
        ‹
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-1">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p as number)}
            className={[
              'px-2 py-0.5 rounded border transition-colors',
              p === page
                ? 'border-sf-accent text-sf-accent'
                : 'border-sf-border hover:text-sf-text',
            ].join(' ')}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        className="px-2 py-0.5 rounded border border-sf-border disabled:opacity-30 hover:text-sf-text transition-colors"
      >
        ›
      </button>
    </div>
  );
}
