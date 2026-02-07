import { useQuery } from '@tanstack/react-query'
import { insightsApi } from '@/modules/open-notebook/lib/api/insights'

export function useInsight(id, options) {
  return useQuery({
    queryKey: ['insights', id],
    queryFn: () => insightsApi.get(id),
    enabled: options?.enabled !== false && !!id,
    staleTime: 30 * 1000, // 30 seconds
  })
}
