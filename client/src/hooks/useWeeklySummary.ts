import { useQuery } from '@tanstack/react-query';
import { weeklyApi } from '@/api/client';

export function useWeeklySummary(weekStart?: string, purpose = 'Load weekly reflection') {
  return useQuery({
    queryKey: ['weeklySummary', weekStart],
    queryFn: () => weeklyApi.getSummary(weekStart, purpose),
  });
}
