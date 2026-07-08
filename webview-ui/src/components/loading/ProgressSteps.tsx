interface Step {
  label: string;
  done: boolean;
  active: boolean;
}

interface Props {
  steps: Step[];
}

export default function ProgressSteps({ steps }: Props) {
  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={[
            'flex items-center gap-2.5 text-xs transition-all',
            step.done   ? 'text-score-good'  : '',
            step.active ? 'text-sf-text'      : '',
            !step.done && !step.active ? 'text-sf-muted' : '',
          ].join(' ')}
          style={{ animationDelay: `${i * 0.06}s`, animation: 'slideInRight 0.25s ease both' }}
        >
          <span className="w-4 text-center shrink-0 font-mono">
            {step.done ? '✓' : step.active ? '›' : '○'}
          </span>
          {step.label}
          {step.active && (
            <span className="ml-auto w-3 h-3 rounded-full border border-sf-accent border-t-transparent animate-spin" />
          )}
        </li>
      ))}
    </ol>
  );
}
