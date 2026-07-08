// Orbiting icon sets: path A (inner, radius 68px) and path B (outer, radius 90px)
const ICONS_A = ['📄', '📊', '🔍', '⚙️'];
const ICONS_B = ['🏗️', '🔐', '🗄️', '🔌'];

const CTA_STEPS = [
  'Scanning architecture patterns…',
  'Reviewing security posture…',
  'Evaluating data model design…',
  'Analysing integration health…',
  'Generating CTA verdict…',
];

// Concentric ring styles: size, border, animation speed & direction
const RINGS = [
  { size: 176, border: '1.5px dashed rgba(56,189,248,0.3)',  anim: 'spinCW',  dur: '8s'   },
  { size: 140, border: '2px solid',                          anim: 'spinCW',  dur: '2.5s', special: 'half' },
  { size: 108, border: '1.5px solid rgba(1,118,211,0.5)',    anim: 'spinCCW', dur: '3.5s', special: 'bottom' },
] as const;

export default function CTALoadingScene() {
  return (
    <div className="relative flex flex-col items-center justify-center py-16 space-y-8 overflow-hidden">

      {/* Scan lines background */}
      {[0, -1, -2].map((delay, i) => (
        <div
          key={i}
          className="pointer-events-none absolute left-0 w-full h-0.5"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent)',
            animation: `scanLine 3s linear infinite`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}

      {/* Brain + rings + orbits container */}
      <div className="relative flex items-center justify-center" style={{ width: 176, height: 176 }}>

        {/* Concentric rings */}
        {RINGS.map((ring, i) => {
          const half = 'special' in ring && ring.special === 'half';
          const bottom = 'special' in ring && ring.special === 'bottom';
          const borderStyle = half
            ? { borderTop: '2px solid #38bdf8', borderRight: '2px solid #0ea5e9', borderBottom: '2px solid transparent', borderLeft: '2px solid transparent' }
            : bottom
            ? { borderTop: '1px solid transparent', borderRight: '1px solid transparent', borderBottom: `1.5px solid rgba(1,118,211,0.5)`, borderLeft: '1px solid transparent' }
            : { border: ring.border };
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width:  ring.size,
                height: ring.size,
                ...borderStyle,
                animation: `${ring.anim} ${ring.dur} linear infinite`,
              }}
            />
          );
        })}

        {/* Brain emoji */}
        <div
          className="relative z-10 text-5xl select-none"
          style={{
            animation: 'pulseRing 2.5s ease-in-out infinite',
            filter: 'drop-shadow(0 0 12px rgba(56,189,248,0.5))',
          }}
        >
          🧠
        </div>

        {/* Orbit path A — inner (radius 68px), 4 icons */}
        {ICONS_A.map((icon, i) => (
          <span
            key={`a-${i}`}
            title={icon}
            className="absolute top-1/2 left-1/2 flex items-center justify-center w-7 h-7 rounded-md bg-sf-bg-3 border border-sf-border/30 text-sm select-none z-20"
            style={{
              marginLeft: '-14px',
              marginTop:  '-14px',
              animation: `orbitA 6s linear infinite`,
              animationDelay: `${-(i * 1.5)}s`,
            }}
          >
            {icon}
          </span>
        ))}

        {/* Orbit path B — outer (radius 90px), 4 icons */}
        {ICONS_B.map((icon, i) => (
          <span
            key={`b-${i}`}
            title={icon}
            className="absolute top-1/2 left-1/2 flex items-center justify-center w-7 h-7 rounded-md bg-sf-bg-3 border border-sf-border/30 text-sm select-none z-20"
            style={{
              marginLeft: '-14px',
              marginTop:  '-14px',
              animation: `orbitB 8s linear infinite`,
              animationDelay: `${-(i * 2)}s`,
            }}
          >
            {icon}
          </span>
        ))}
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-sf-text">AI Architecture Review</p>
        <p className="text-xs text-sf-muted">Analysing your org against CTA-grade standards…</p>
      </div>

      {/* Sequential steps */}
      <ol className="space-y-2.5 w-60">
        {CTA_STEPS.map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-2.5 text-xs"
            style={{
              animation: 'stepAppear 0.5s ease both',
              animationDelay: `${i * 3}s`,
              opacity: 0,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full bg-sf-accent shrink-0"
              style={{ animation: `dotPulse 1s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
            />
            <span className="text-sf-text-2">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
