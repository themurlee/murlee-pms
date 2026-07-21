import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface MaintenanceTicket {
  id: string;
  tenant: string;
  issue: string;
  status: string;
  channel: string;
  priority: string;
  category: string;
  reported_at: string;
  property_name: string | null;
  unit_number: string | null;
}

export interface NewTicket {
  tenant_id?: string;
  unit_id?: string;
  property_id?: string;
  tenant?: string;
  property_name?: string | null;
  unit_number?: string | null;
  issue: string;
  channel: string;
  status: string;
  priority: string;
  category: string;
  reported_at: string;
}

export interface InboundEmail {
  from_email?: string;
  from_name?: string;
  property_hint?: string;
  subject: string;
  body: string;
}

export const useMaintenanceTickets = () => {
  const queryClient = useQueryClient();

  const query = useQuery<MaintenanceTicket[]>({
    queryKey: ['maintenance'],
    queryFn: async () => (await api.get('/maintenance')).data,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['maintenance'] });

  const createMutation = useMutation({
    mutationFn: async (input: NewTicket) => (await api.post('/maintenance', input)).data,
    onSuccess: invalidate,
  });

  const inboundMutation = useMutation({
    mutationFn: async (input: InboundEmail): Promise<{ ticketId: string; matchedBy: string }> =>
      (await api.post('/maintenance/inbound', input)).data,
    onSuccess: invalidate,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.put(`/maintenance/${id}/status`, { status })).data,
    onSuccess: invalidate,
  });

  return {
    tickets: query.data ?? [],
    isLoading: query.isLoading,
    createTicket: createMutation.mutateAsync,
    inboundEmail: inboundMutation.mutateAsync,
    updateTicketStatus: updateStatusMutation.mutateAsync,
  };
};
