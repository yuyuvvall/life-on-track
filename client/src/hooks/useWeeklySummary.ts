import { useQuery, useMutation } from '@tanstack/react-query';
import { weeklyApi } from '@/api/client';

export function useWeeklySummary(weekStart?: string, purpose = 'Load weekly reflection') {
  return useQuery({
    queryKey: ['weeklySummary', weekStart],
    queryFn: () => weeklyApi.getSummary(weekStart, purpose),
  });
}

export function useSubmitReflection() {
  return useMutation({
    mutationFn: (reflection: string) =>
      weeklyApi.submitReflection(reflection, 'Submit weekly reflection'),
  });
}
