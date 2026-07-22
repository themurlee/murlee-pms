import { useState } from 'react';
import { CommunicationsSidebar, CommunicationsView } from './CommunicationsSidebar';
import { ThreadList } from './ThreadList';
import { ThreadView } from './ThreadView';
import { CommunicationsLog } from './CommunicationsLog';
import { NewMessageModal } from './NewMessageModal';
import { useThreads } from '../../hooks/useThreads';

export const Communications = () => {
  const [view, setView] = useState<CommunicationsView>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const { threads, isLoading, createThread, isCreating } = useThreads(view === 'inbox' ? 'unread' : 'all');
  const { threads: unreadThreads } = useThreads('unread');

  const selectView = (v: CommunicationsView) => {
    setView(v);
    setSelectedThreadId(null);
  };

  if (view === 'log') {
    return (
      <div className="flex gap-4 items-start">
        <CommunicationsSidebar active={view} onSelect={selectView} unreadCount={unreadThreads.length} />
        <div className="flex-1 min-w-0">
          <CommunicationsLog />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      <CommunicationsSidebar active={view} onSelect={selectView} unreadCount={unreadThreads.length} />
      <div className="flex-1 flex glass-panel rounded-2xl overflow-hidden">
        <ThreadList
          threads={threads}
          selectedId={selectedThreadId}
          onSelect={setSelectedThreadId}
          isLoading={isLoading}
          onNewMessage={() => setShowCompose(true)}
        />
        <ThreadView threadId={selectedThreadId} />
      </div>
      {showCompose && (
        <NewMessageModal
          onClose={() => setShowCompose(false)}
          isSending={isCreating}
          onSend={async (input) => {
            const created = await createThread(input);
            setSelectedThreadId(created.id);
          }}
        />
      )}
    </div>
  );
};
