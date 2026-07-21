import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface AddressParts {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface UnitInput {
  unit_number: string;
  beds?: number | null;
  baths?: number | null;
  sq_ft?: number | null;
  market_rent?: number;
}

export interface Property {
  id: string;
  name: string;
  units: number;
  income: number;
  address: string;
  address_parts?: AddressParts;
  property_type?: string;
  entity_id?: string | null;
  entity_name?: string | null;
}

export interface PropertyCreateInput {
  name: string;
  address: AddressParts;
  property_type: string;
  entity_id: string | null;
  unit_list?: UnitInput[];
  units?: number;
  income?: number;
}

export interface PropertyUpdateInput {
  id: string;
  name: string;
  address: AddressParts;
  property_type: string;
  entity_id: string | null;
  income: number;
}

export const useProperties = () => {
  const queryClient = useQueryClient();

  const query = useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => (await api.get('/properties')).data,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['properties'] });
    queryClient.invalidateQueries({ queryKey: ['units'] });
    queryClient.invalidateQueries({ queryKey: ['entities'] });
  };

  const createMutation = useMutation({
    mutationFn: async (input: PropertyCreateInput) => (await api.post('/properties', input)).data,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: PropertyUpdateInput) => (await api.put(`/properties/${id}`, input)).data,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/properties/${id}`)).data,
    onSuccess: invalidate,
  });

  return {
    properties: query.data ?? [],
    isLoading: query.isLoading,
    createProperty: createMutation.mutateAsync,
    updateProperty: updateMutation.mutateAsync,
    deleteProperty: deleteMutation.mutateAsync,
  };
};
