import { describe, expect, it } from 'vitest';

import { createEmptyMapEntityDraft, type AdminMapEntityReferences } from './adminMapEntities';
import { validateAdminMapEntityDraft } from './adminMapEntityValidation';
import { getEntityLifecycleLabel, isEntityLifecycleStatusValid } from './entityLifecycle';

const references: AdminMapEntityReferences = {
  categories: [{ id: 'category-test', name: 'Test', publicationStatus: 'published' }],
  tags: [],
  players: [],
};

function validDraft(entityType: 'mission' | 'hazard') {
  return {
    ...createEmptyMapEntityDraft(references, entityType),
    id: `entity-map064-${entityType}`,
    slug: `map064-${entityType}`,
    name: entityType === 'mission' ? 'Misión MAP-064' : 'Peligro MAP-064',
    categoryId: 'category-test',
    x: 1800,
    y: 1200,
  };
}

describe('MAP-064 functional lifecycle', () => {
  it('keeps lifecycle validity separate for missions, hazards and legacy entity types', () => {
    expect(isEntityLifecycleStatusValid('mission', 'active')).toBe(true);
    expect(isEntityLifecycleStatusValid('mission', 'completed')).toBe(true);
    expect(isEntityLifecycleStatusValid('mission', 'failed')).toBe(true);
    expect(isEntityLifecycleStatusValid('mission', 'resolved')).toBe(false);
    expect(isEntityLifecycleStatusValid('hazard', 'active')).toBe(true);
    expect(isEntityLifecycleStatusValid('hazard', 'resolved')).toBe(true);
    expect(isEntityLifecycleStatusValid('hazard', 'completed')).toBe(false);
    expect(isEntityLifecycleStatusValid('character', null)).toBe(true);
    expect(isEntityLifecycleStatusValid('location', 'active')).toBe(false);
  });

  it('provides the required accessible Spanish lifecycle labels', () => {
    expect(getEntityLifecycleLabel('mission', 'active')).toBe('Activa');
    expect(getEntityLifecycleLabel('mission', 'completed')).toBe('Completada');
    expect(getEntityLifecycleLabel('mission', 'failed')).toBe('Fallida');
    expect(getEntityLifecycleLabel('hazard', 'active')).toBe('Activo');
    expect(getEntityLifecycleLabel('hazard', 'resolved')).toBe('Resuelto');
  });

  it('initializes mission and hazard drafts as active without changing publication state', () => {
    const mission = validDraft('mission');
    const hazard = validDraft('hazard');
    expect(mission.lifecycleStatus).toBe('active');
    expect(hazard.lifecycleStatus).toBe('active');
    expect(mission.publicationStatus).toBe('draft');
    expect(hazard.publicationStatus).toBe('draft');
  });

  it('accepts completed/failed/resolved while rejecting cross-kind lifecycle values', () => {
    const completed = validateAdminMapEntityDraft(
      { ...validDraft('mission'), lifecycleStatus: 'completed', publicationStatus: 'published' },
      references,
    );
    const failed = validateAdminMapEntityDraft(
      { ...validDraft('mission'), lifecycleStatus: 'failed', publicationStatus: 'published' },
      references,
    );
    const resolved = validateAdminMapEntityDraft(
      { ...validDraft('hazard'), lifecycleStatus: 'resolved', publicationStatus: 'published' },
      references,
    );
    const invalidMission = validateAdminMapEntityDraft(
      { ...validDraft('mission'), lifecycleStatus: 'resolved' },
      references,
    );
    const invalidHazard = validateAdminMapEntityDraft(
      { ...validDraft('hazard'), lifecycleStatus: 'failed' },
      references,
    );

    expect(completed.valid).toBe(true);
    expect(failed.valid).toBe(true);
    expect(resolved.valid).toBe(true);
    expect(invalidMission.fieldErrors.lifecycleStatus).toMatch(/Activa, Completada o Fallida/);
    expect(invalidHazard.fieldErrors.lifecycleStatus).toMatch(/Activo o Resuelto/);
  });
});
