import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Notice {
  id: string;
  type: 'rent_reminder' | 'late_notice' | 'maintenance_update' | 'payment_confirmation' | 'adhoc';
  channel: string;
  to_email: string;
  subject: string;
  status: 'sent' | 'failed' | 'logged';
  created_at: string;
  tenant_name: string;
}

export const useNotices = () => {
  const queryClient = useQueryClient();

  const query = useQuery<Notice[]>({
    queryKey: ['notices'],
    queryFn: async () => (await api.get('/notices')).data,
    staleTime: 15_000,
  });

  const sendMutation = useMutation({
    mutationFn: async (input: { tenant_id: string; subject: string; body: string }) =>
      (await api.post('/notices', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notices'] }),
  });

  return {
    notices: query.data ?? [],
    isLoading: query.isLoading,
    sendNotice: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
  };
};
