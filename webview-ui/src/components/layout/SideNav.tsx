import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { NAV_GROUPS } from '@/constants/tabs';
import { useUIStore } from '@/store/slices/uiStore';

export default function SideNav() {
  const collapsed = useUIStore((s) => s.sideNavCollapsed);
  const toggle = useUIStore((s) => s.toggleSideNav);
  const iconUri = (window as Window & { ORGPULSE_ICON_URI?: string }).ORGPULSE_ICON_URI;

  return (
    <aside
      className={cn(
        'flex flex-col shrink-0 border-r border-sf-border bg-sf-bg-2 transition-all duration-200 overflow-hidden',
        collapsed ? 'w-[52px]' : 'w-[220px]'
      )}
    >
      {/* Logo / branding */}
      <div className={cn('shrink-0 flex items-center gap-2.5 px-3 py-3 border-b border-sf-border', collapsed && 'justify-center')}>
        {iconUri && (
          <img src={iconUri} alt="OrgPulse" className="w-6 h-6 shrink-0 rounded" />
        )}
        {!collapsed && (
          <span className="text-sm font-semibold text-sf-text truncate">OrgPulse</span>
        )}
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1">
            {/* Group header */}
            {!collapsed && (
              <p className="px-4 pt-3 pb-1 text-xs font-semibold tracking-widest text-sf-muted uppercase select-none">
                {group.label}
              </p>
            )}
            {collapsed && (
              <div className="mx-2 my-1 border-t border-sf-border/50" />
            )}

            {/* Nav items */}
            {group.items.map((item) =>
              item.disabled ? (
                <span
                  key={item.id}
                  title={collapsed ? `${item.label} (coming soon)` : 'Coming soon'}
                  className={cn(
                    'flex items-center gap-2.5 mx-1.5 my-0.5 px-2.5 py-1.5 rounded-lg text-sm opacity-40 cursor-not-allowed select-none',
                    collapsed ? 'justify-center' : ''
                  )}
                >
                  <span role="img" aria-hidden className="shrink-0 text-sm leading-none">
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1 text-sf-muted">{item.label}</span>
                      <span className="text-[9px] font-semibold tracking-wide bg-sf-border text-sf-muted rounded px-1 py-0.5 shrink-0">SOON</span>
                    </>
                  )}
                </span>
              ) : (
                <NavLink
                  key={item.id}
                  to={item.path}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 mx-1.5 my-0.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                      collapsed ? 'justify-center' : '',
                      isActive
                        ? 'bg-sf-accent/15 text-sf-accent font-medium'
                        : 'text-sf-muted hover:text-sf-text hover:bg-sf-bg-3'
                    )
                  }
                >
                  <span role="img" aria-hidden className="shrink-0 text-sm leading-none">
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </NavLink>
              )
            )}
          </div>
        ))}
      </nav>

      {/* Collapse toggle at bottom */}
      <div className="shrink-0 border-t border-sf-border p-2 flex justify-end">
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-sf-muted hover:text-sf-text hover:bg-sf-bg-3 transition-colors"
        >
          <svg
            className={cn('w-4 h-4 transition-transform duration-200', collapsed ? 'rotate-180' : '')}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
