import { useState, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Position = 'top' | 'bottom' | 'left' | 'right';

interface Props {
  content: ReactNode;
  children: ReactNode;
  position?: Position;
  className?: string;
}

const POSITION_CLASS: Record<Position, string> = {
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

export default function Tooltip({ content, children, position = 'top', className }: Props) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  };

  const hide = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 px-2 py-1 text-[11px] leading-snug rounded shadow-glass',
            'bg-sf-bg-3 border border-sf-border text-sf-text whitespace-nowrap pointer-events-none',
            'animate-[fadeIn_0.1s_ease]',
            POSITION_CLASS[position],
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
