import type { EntityLifecycleStatus, EntityType } from '../data/beta02-model';

export type EntityLifecycleLabel = 'Activa' | 'Completada' | 'Fallida' | 'Activo' | 'Resuelto';

export function isEntityLifecycleStatusValid(
  entityType: EntityType,
  lifecycleStatus: EntityLifecycleStatus | null | undefined,
): boolean {
  if (entityType === 'character' || entityType === 'location') return lifecycleStatus == null;
  if (entityType === 'mission') {
    return lifecycleStatus === 'active' || lifecycleStatus === 'completed' || lifecycleStatus === 'failed';
  }
  return lifecycleStatus === 'active' || lifecycleStatus === 'resolved';
}

export function getEntityLifecycleLabel(
  entityType: EntityType,
  lifecycleStatus: EntityLifecycleStatus | null | undefined,
): EntityLifecycleLabel | null {
  if (entityType === 'mission') {
    if (lifecycleStatus === 'completed') return 'Completada';
    if (lifecycleStatus === 'failed') return 'Fallida';
    return lifecycleStatus === 'active' ? 'Activa' : null;
  }
  if (entityType === 'hazard') {
    if (lifecycleStatus === 'resolved') return 'Resuelto';
    return lifecycleStatus === 'active' ? 'Activo' : null;
  }
  return null;
}
