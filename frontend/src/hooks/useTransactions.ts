import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  category: string;
  account_class: 'real_estate' | 'personal';
  source: 'manual' | 'csv' | 'plaid';
  payment_method: string;
  property_id: string | null;
  entity_id: string | null;
  invoice_id: string | null;
  reviewed: boolean;
  memo: string;
}

export type TransactionInput = {
  amount: number;
  transaction_date: string;
  description: string;
  category: string;
  account_class?: 'real_estate' | 'personal';
  property_id?: string | null;
  entity_id?: string | null;
  payment_method?: string;
};

export type TransactionFilters = { account_class?: 'real_estate' | 'personal' };

export const useTransactions = (filters: TransactionFilters = {}) => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['transactions'] });

  const query = useQuery<Transaction[]>({
    queryKey: ['transactions', filters],
    queryFn: async () => (await api.get('/transactions', { params: filters })).data,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: TransactionInput) => (await api.post('/transactions', input)).data,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Transaction> & { id: string }) =>
      (await api.patch(`/transactions/${id}`, patch)).data,
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/transactions/${id}`)).data,
    onSuccess: invalidate,
  });

  return {
    transactions: query.data ?? [],
    isLoading: query.isLoading,
    createTransaction: createMutation.mutateAsync,
    updateTransaction: updateMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutateAsync,
  };
};
