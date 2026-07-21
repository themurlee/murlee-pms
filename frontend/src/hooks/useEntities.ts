import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Entity {
  id: string;
  name: string;
  entity_type: string;
  ein: string;
  property_count: number;
}

export type EntityInput = { name: string; entity_type: string; ein: string };

export const useEntities = () => {
  const queryClient = useQueryClient();

  const query = useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => (await api.get('/entities')).data,
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['entities'] });

  const createMutation = useMutation({
    mutationFn: async (input: EntityInput) => (await api.post('/entities', input)).data,
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: EntityInput & { id: string }) => (await api.put(`/entities/${id}`, input)).data,
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/entities/${id}`)).data,
    onSuccess: invalidate,
  });

  return {
    entities: query.data ?? [],
    isLoading: query.isLoading,
    createEntity: createMutation.mutateAsync,
    updateEntity: updateMutation.mutateAsync,
    deleteEntity: deleteMutation.mutateAsync,
  };
};
