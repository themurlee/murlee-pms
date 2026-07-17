import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const useInvoiceActions = () => {
  const queryClient = useQueryClient();

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await axios.post(`/api/invoices/${invoiceId}/mark-paid`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await axios.delete(`/api/invoices/${invoiceId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  return {
    markAsPaid: markAsPaidMutation.mutateAsync,
    deleteInvoice: deleteInvoiceMutation.mutateAsync,
    isLoading: markAsPaidMutation.isPending || deleteInvoiceMutation.isPending,
    error: markAsPaidMutation.error || deleteInvoiceMutation.error,
  };
};
