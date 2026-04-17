const OPTIMISTIC_PREFIX = 'optimistic-';

export function optimisticId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${OPTIMISTIC_PREFIX}${random}`;
}

export function isOptimistic(id: string | number | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(OPTIMISTIC_PREFIX);
}
