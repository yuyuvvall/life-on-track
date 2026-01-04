import { useQuery } from '@tanstack/react-query';
import { weeklyApi } from '@/api/client';

export function useWeeklySummary(weekStart?: string) {
  return useQuery({
    queryKey: ['weeklySummary', weekStart],
    queryFn: () => weeklyApi.getSummary(weekStart),
  });
}

