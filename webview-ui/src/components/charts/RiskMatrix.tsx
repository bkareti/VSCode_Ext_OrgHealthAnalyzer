type Severity = 'Low' | 'Medium' | 'High';

interface Cell {
  domain: string;
  likelihood: Severity;
  impact: Severity;
}

interface Props {
  cells: Cell[];
}

const LEVELS: Severity[] = ['Low', 'Medium', 'High'];

// Classic 3x3 risk matrix shading — top-right (high likelihood x high impact)
// is hottest, bottom-left (low x low) is coolest.
const CELL_STYLE: Record<string, string> = {
  'High-Low': 'bg-amber-500/20 border-amber-500/40',
  'High-Medium': 'bg-red-500/20 border-red-500/40',
  'High-High': 'bg-red-600/30 border-red-600/50',
  'Medium-Low': 'bg-score-good/15 border-score-good/30',
  'Medium-Medium': 'bg-amber-500/20 border-amber-500/40',
  'Medium-High': 'bg-red-500/20 border-red-500/40',
  'Low-Low': 'bg-score-good/15 border-score-good/30',
  'Low-Medium': 'bg-score-good/15 border-score-good/30',
  'Low-High': 'bg-amber-500/20 border-amber-500/40',
};

/** Likelihood x Impact risk matrix — the standard board-report visual for domain risk. */
export default function RiskMatrix({ cells }: Props) {
  const byCell = new Map<string, string[]>();
  for (const c of cells) {
    const key = `${c.impact}-${c.likelihood}`;
    byCell.set(key, [...(byCell.get(key) ?? []), c.domain]);
  }

  return (
    <div className="flex gap-2">
      <div className="flex shrink-0 flex-col items-center justify-center">
        <span className="rotate-180 text-[10px] tracking-wider text-sf-muted uppercase [writing-mode:vertical-lr]">
          Impact
        </span>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-3 gap-1.5">
          {[...LEVELS].reverse().map((impact) =>
            LEVELS.map((likelihood) => {
              const key = `${impact}-${likelihood}`;
              const domains = byCell.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={`min-h-[52px] rounded border p-1.5 ${CELL_STYLE[key]}`}
                >
                  {domains.map((d) => (
                    <p key={d} className="text-[10px] leading-tight font-medium text-sf-text">
                      {d}
                    </p>
                  ))}
                </div>
              );
            })
          )}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
          {LEVELS.map((l) => (
            <span key={l} className="text-[10px] text-sf-muted">
              {l}
            </span>
          ))}
        </div>
        <p className="mt-0.5 text-center text-[10px] tracking-wider text-sf-muted uppercase">
          Likelihood
        </p>
      </div>
    </div>
  );
}
