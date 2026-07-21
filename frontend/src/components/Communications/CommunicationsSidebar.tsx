import { useState } from 'react';

export type CommunicationsView = 'inbox' | 'all' | 'log';

interface CommunicationsSidebarProps {
  active: CommunicationsView;
  onSelect: (view: CommunicationsView) => void;
  unreadCount: number;
}

const InboxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const AllMessagesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const LogIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);

const NAV: { key: CommunicationsView; label: string; icon: () => JSX.Element }[] = [
  { key: 'inbox', label: 'My Inbox', icon: InboxIcon },
  { key: 'all', label: 'All Messages', icon: AllMessagesIcon },
  { key: 'log', label: 'Communications Log', icon: LogIcon },
];

export const CommunicationsSidebar = ({ active, onSelect, unreadCount }: CommunicationsSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`flex flex-col gap-1 border-r border-white/5 bg-slate-900/30 backdrop-blur-2xl rounded-2xl p-3 shrink-0 transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="self-end p-1.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white mb-2"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
        </svg>
      </button>

      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-outfit transition-all ${
              active === item.key ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            <Icon />
            {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
            {!collapsed && item.key === 'inbox' && unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-indigo-500 text-white rounded-full px-1.5 py-0.5">{unreadCount}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
