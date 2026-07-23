import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const useInvoiceActions = () => {
  const queryClient = useQueryClient();

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await api.post(`/invoices/${invoiceId}/mark-paid`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await api.delete(`/invoices/${invoiceId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const addInvoiceItemMutation = useMutation({
    mutationFn: async ({ invoiceId, description, amount }: { invoiceId: string; description: string; amount: number }) => {
      const response = await api.post(`/invoices/${invoiceId}/items`, { description, amount });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const deleteInvoiceItemMutation = useMutation({
    mutationFn: async ({ invoiceId, itemId }: { invoiceId: string; itemId: string }) => {
      const response = await api.delete(`/invoices/${invoiceId}/items/${itemId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const batchMarkAsPaidMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const response = await api.post('/invoices/batch/mark-paid', { ids: invoiceIds });
      return response.data as { success_count: number; error_count: number; results: { id: string; ok: boolean; error?: string }[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  return {
    markAsPaid: markAsPaidMutation.mutateAsync,
    deleteInvoice: deleteInvoiceMutation.mutateAsync,
    addInvoiceItem: addInvoiceItemMutation.mutateAsync,
    deleteInvoiceItem: deleteInvoiceItemMutation.mutateAsync,
    batchMarkAsPaid: batchMarkAsPaidMutation.mutateAsync,
    isLoading: markAsPaidMutation.isPending || deleteInvoiceMutation.isPending || batchMarkAsPaidMutation.isPending,
    error: markAsPaidMutation.error || deleteInvoiceMutation.error,
  };
};
