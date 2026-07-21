import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface Unit {
  id: string;
  unit_number: string;
  beds: number | null;
  baths: number | null;
  sq_ft: number | null;
  market_rent: number;
  property_id: string;
  property_name: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_email: string | null;
  rent: number | null;
  lease_start: string | null;
  lease_end: string | null;
  balance_due: number | null;
}

export const useUnits = () => {
  const query = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: async () => (await api.get('/units')).data,
    staleTime: 60_000,
  });
  return { units: query.data ?? [], isLoading: query.isLoading };
};
