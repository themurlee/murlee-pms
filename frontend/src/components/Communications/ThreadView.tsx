import { useEffect, useState } from 'react';
import { useThreadMessages } from '../../hooks/useThreads';

interface ThreadViewProps {
  threadId: string | null;
}

export const ThreadView = ({ threadId }: ThreadViewProps) => {
  const { messages, isLoading, reply, isReplying, markRead } = useThreadMessages(threadId);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (threadId) {
      markRead().catch(() => {});
    }
    // Only re-run when the selected thread changes, not on every markRead identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  if (!threadId) {
    return <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Select a conversation</div>;
  }

  const handleSend = async () => {
    if (!draft.trim()) return;
    await reply(draft);
    setDraft('');
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
        {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
              m.direction === 'outbound' ? 'self-end bg-indigo-600 text-white' : 'self-start bg-white/5 text-slate-200'
            }`}
          >
            {m.body}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-white/5 flex gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply…"
          className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600 resize-none min-h-[48px]"
        />
        <button
          onClick={handleSend}
          disabled={isReplying || !draft.trim()}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 font-bold text-white text-sm shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 text-outfit"
        >
          {isReplying ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
};
