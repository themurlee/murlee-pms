import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface BillingSettings {
  late_fee_amount: number;
  late_fee_grace_days: number;
  reminder_days_before: number;
  late_fee_enabled: boolean;
  reminders_enabled: boolean;
}

export interface BillingRunSummary {
  generated: number;
  lateFees: number;
  reminders: number;
  note?: string;
}

export const useBillingSettings = () => {
  const queryClient = useQueryClient();

  const query = useQuery<BillingSettings>({
    queryKey: ['billing-settings'],
    queryFn: async () => (await api.get('/billing/settings')).data,
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (input: BillingSettings) => (await api.put('/billing/settings', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing-settings'] }),
  });

  const runMutation = useMutation({
    mutationFn: async (): Promise<BillingRunSummary> => (await api.post('/billing/run')).data,
    onSuccess: () => {
      // New invoices / notices may have been created.
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    updateSettings: updateMutation.mutateAsync,
    isSaving: updateMutation.isPending,
    runCycle: runMutation.mutateAsync,
    isRunning: runMutation.isPending,
  };
};
