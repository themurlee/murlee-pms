import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Invoice } from '../types/invoice';

export const useInvoices = () => {
  return useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await api.get('/invoices');
      return data;
    },
  });
};
