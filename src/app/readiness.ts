export type ReadinessStatus = 'ready' | 'planned';

export interface ReadinessItem {
  readonly title: string;
  readonly description: string;
  readonly status: ReadinessStatus;
}

export const readinessItems: readonly ReadinessItem[] = [
  {
    title: 'Base técnica',
    description: 'Vite y TypeScript preparados para desarrollo y compilación.',
    status: 'ready',
  },
  {
    title: 'Calidad automática',
    description: 'Lint, formato, pruebas unitarias, e2e y CI configurados.',
    status: 'ready',
  },
  {
    title: 'Mapa navegable',
    description: 'Reservado para MAP-004; no se carga ningún recurso cartográfico.',
    status: 'planned',
  },
] as const;

export function countReadyItems(items: readonly ReadinessItem[]): number {
  return items.filter(({ status }) => status === 'ready').length;
}
