import { useState } from 'react';
import { Thread } from '../../hooks/useThreads';

interface ThreadListProps {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  onNewMessage: () => void;
}

export const ThreadList = ({ threads, selectedId, onSelect, isLoading, onNewMessage }: ThreadListProps) => {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q
    ? threads.filter((t) => t.tenant_name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q))
    : threads;

  return (
    <div className="w-full sm:w-80 shrink-0 border-r border-white/5 flex flex-col">
      <div className="p-3 border-b border-white/5 flex flex-col gap-2">
        <button
          onClick={onNewMessage}
          className="w-full px-3 py-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.01] transition-all text-outfit"
        >
          + New Message
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
        />
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
        {!isLoading && filtered.length === 0 && <div className="p-4 text-sm text-slate-500">No conversations.</div>}
        {filtered.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`w-full text-left p-4 flex flex-col gap-1 transition-colors ${selectedId === t.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
          >
            <div className="flex justify-between items-center gap-2">
              <span className={`text-sm font-semibold truncate ${t.unread ? 'text-white' : 'text-slate-300'}`}>{t.tenant_name}</span>
              {t.unread && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
            </div>
            <span className="text-xs text-slate-400 truncate">{t.subject}</span>
            <span className="text-xs text-slate-500 truncate">{t.last_message_preview}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
