import type { DependencyGraph, DependencyNodeType } from '@/types';

interface Props {
  graph: DependencyGraph;
  maxNodes?: number;
}

const COLUMN_TYPES: Record<'automation' | 'logic' | 'data', DependencyNodeType[]> = {
  automation: ['apex-trigger', 'flow'],
  logic: ['apex-class', 'lwc', 'aura', 'visualforce', 'validation-rule'],
  data: ['object'],
};

const COLUMN_META: { key: keyof typeof COLUMN_TYPES; label: string; color: string }[] = [
  { key: 'automation', label: 'Triggers & Flows', color: '#8b5cf6' },
  { key: 'logic', label: 'Apex & Components', color: '#3b82f6' },
  { key: 'data', label: 'Objects', color: '#f59e0b' },
];

const MAX_PER_COLUMN = 6;

/**
 * Lightweight, dependency-free architecture map for the top-connected nodes
 * in the already-computed dependency graph — grouped Automation → Logic →
 * Data, edges drawn only between nodes that made the cut. Not a general
 * force-directed graph; just enough to show the org's key relationships.
 */
export default function DependencyDiagram({ graph, maxNodes = 15 }: Props) {
  const ranked = [...graph.nodes]
    .sort((a, b) => ((b.fanIn ?? 0) + (b.fanOut ?? 0)) - ((a.fanIn ?? 0) + (a.fanOut ?? 0)))
    .slice(0, maxNodes);

  const columns = COLUMN_META.map((col) => ({
    ...col,
    nodes: ranked.filter((n) => COLUMN_TYPES[col.key].includes(n.type)).slice(0, MAX_PER_COLUMN),
  })).filter((col) => col.nodes.length > 0);

  if (columns.length === 0) { return null; }

  const width = 640;
  const height = Math.max(180, Math.max(...columns.map((c) => c.nodes.length)) * 46 + 50);
  const colX = columns.map((_, i) => 90 + (i * (width - 180)) / Math.max(columns.length - 1, 1));

  const nodePos = new Map<string, { x: number; y: number; color: string }>();
  columns.forEach((col, ci) => {
    const x = colX[ci];
    const rowGap = (height - 40) / (col.nodes.length + 1);
    col.nodes.forEach((n, ni) => {
      nodePos.set(n.id, { x, y: rowGap * (ni + 1) + 10, color: col.color });
    });
  });

  const visibleIds = new Set(nodePos.keys());
  const edges = graph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="mx-auto" style={{ minWidth: width }}>
        {edges.map((e, i) => {
          const from = nodePos.get(e.from)!;
          const to = nodePos.get(e.to)!;
          return (
            <line
              key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="rgba(148,163,184,0.35)"
              strokeWidth={1}
            />
          );
        })}
        {columns.map((col) =>
          col.nodes.map((n) => {
            const pos = nodePos.get(n.id)!;
            const label = n.label.length > 22 ? `${n.label.slice(0, 20)}…` : n.label;
            return (
              <g key={n.id}>
                <circle cx={pos.x} cy={pos.y} r={5} fill={col.color} />
                <text x={pos.x} y={pos.y - 10} textAnchor="middle" fontSize={9} fill="#9d9d9d">
                  {label}
                </text>
              </g>
            );
          })
        )}
        {columns.map((col, ci) => (
          <text
            key={col.key}
            x={colX[ci]}
            y={height - 10}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={col.color}
          >
            {col.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
