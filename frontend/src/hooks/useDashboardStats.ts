import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface DashboardSummary {
  grossMonthlyIncome: number;
  totalUnits: number;
  occupiedUnits: number;
  overdueTotal: number;
  openMaintenanceCount: number;
  rentCollectionRate: number;
}

export const useDashboardStats = () => {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/summary');
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
};
