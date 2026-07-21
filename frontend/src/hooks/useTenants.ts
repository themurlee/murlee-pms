import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  phone: string;
  lease_id: string | null;
  unit_id: string | null;
  property_id: string | null;
  unit: string;
  rent: number;
  due_day: number;
  start_date: string;
  end_date: string;
  delinquency_notes: string;
  eviction_notes: string;
  housing_authority: string;
  payment_plan: string;
  documents?: string[];
}

export interface TenantInput {
  name: string;
  email: string;
  phone: string;
  unit_id: string;
  rent: number;
  due_day: number;
  start_date: string;
  end_date: string;
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
    queryClient.invalidateQueries({ queryKey: ['units'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: TenantInput) => (await api.post('/tenants', input)).data,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: TenantInput & { id: string }) => (await api.put(`/tenants/${id}`, input)).data,
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
