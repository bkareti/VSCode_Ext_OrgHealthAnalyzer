import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { TABS } from '@/constants/tabs';

export default function TabNav() {
  return (
    <nav className="flex overflow-x-auto border-b border-sf-border bg-sf-bg-2 shrink-0 scrollbar-none">
      {TABS.map((tab) => (
        <NavLink
          key={tab.id}
          to={tab.path}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors shrink-0',
              isActive
                ? 'border-sf-accent text-sf-text font-medium'
                : 'border-transparent text-sf-muted hover:text-sf-text-2 hover:border-sf-border'
            )
          }
        >
          <span role="img" aria-hidden>{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
