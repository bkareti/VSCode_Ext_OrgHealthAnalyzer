interface Props {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export default function GlassCard({ children, className = '', title }: Props) {
  return (
    <div
      className={`rounded-xl border border-sf-border bg-white/[0.03] backdrop-blur-[8px] shadow-glass p-4 ${className}`}
    >
      {title && <h3 className="text-xs font-semibold text-sf-text mb-3">{title}</h3>}
      {children}
    </div>
  );
}
