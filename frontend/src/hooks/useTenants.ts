import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  unit: string;
  rent: number;
  delinquency_notes: string;
  eviction_notes: string;
  housing_authority: string;
  payment_plan: string;
  documents?: string[];
}

export const useTenants = () => {
  const queryClient = useQueryClient();

  const query = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data } = await api.get('/tenants');
      return data;
    },
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tenants'] });

  const createMutation = useMutation({
    mutationFn: async (input: Omit<Tenant, 'id'>) => (await api.post('/tenants', input)).data,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: Tenant) => (await api.put(`/tenants/${id}`, input)).data,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tenants/${id}`)).data,
    onSuccess: invalidate,
  });

  return {
    tenants: query.data ?? [],
    isLoading: query.isLoading,
    createTenant: createMutation.mutateAsync,
    updateTenant: updateMutation.mutateAsync,
    deleteTenant: deleteMutation.mutateAsync,
  };
};
