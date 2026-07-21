import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Thread {
  id: string;
  tenant_id: string | null;
  tenant_name: string;
  subject: string;
  last_message_preview: string;
  last_message_at: string;
  unread: boolean;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
}

export const useThreads = (filter: 'unread' | 'all' = 'all') => {
  const queryClient = useQueryClient();

  const query = useQuery<Thread[]>({
    queryKey: ['threads', filter],
    queryFn: async () => (await api.get('/threads', { params: filter === 'unread' ? { filter: 'unread' } : {} })).data,
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: { tenant_id: string; subject: string; body: string }) =>
      (await api.post('/threads', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
  });

  return {
    threads: query.data ?? [],
    isLoading: query.isLoading,
    createThread: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};

export const useThreadMessages = (threadId: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery<ThreadMessage[]>({
    queryKey: ['thread-messages', threadId],
    queryFn: async () => (await api.get(`/threads/${threadId}/messages`)).data,
    enabled: !!threadId,
    staleTime: 5_000,
  });

  const replyMutation = useMutation({
    mutationFn: async (body: string) => (await api.post(`/threads/${threadId}/messages`, { body })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread-messages', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async () => (await api.patch(`/threads/${threadId}`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
  });

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    reply: replyMutation.mutateAsync,
    isReplying: replyMutation.isPending,
    markRead: markReadMutation.mutateAsync,
  };
};
