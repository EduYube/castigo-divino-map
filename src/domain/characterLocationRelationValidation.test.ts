import { describe, expect, test } from 'vitest';

import type {
  AdminCharacterLocationRelationRecord,
  AdminCharacterLocationRelationReferences,
} from './characterLocationRelations';
import { validateCharacterLocationRelationDraft } from './characterLocationRelationValidation';

const references: AdminCharacterLocationRelationReferences = {
  characters: [
    {
      id: 'entity-character',
      name: 'Character',
      entityType: 'character',
      publicationStatus: 'published',
    },
    {
      id: 'entity-character-draft',
      name: 'Draft',
      entityType: 'character',
      publicationStatus: 'draft',
    },
    {
      id: 'entity-character-archived',
      name: 'Archived',
      entityType: 'character',
      publicationStatus: 'archived',
    },
  ],
  locations: [
    {
      id: 'entity-location',
      name: 'Location',
      entityType: 'location',
      publicationStatus: 'published',
    },
    {
      id: 'entity-location-draft',
      name: 'Draft location',
      entityType: 'location',
      publicationStatus: 'draft',
    },
  ],
};

const existing: AdminCharacterLocationRelationRecord = {
  characterId: 'entity-character',
  locationId: 'entity-location',
  relationStatus: 'associated',
  publicationStatus: 'published',
  publishedAt: '2026-08-07T00:00:00Z',
  archivedAt: null,
  updatedAt: '2026-08-07T00:00:00Z',
};

describe('validateCharacterLocationRelationDraft', () => {
  test('accepts a published relation only between published compatible endpoints', () => {
    expect(
      validateCharacterLocationRelationDraft(
        {
          characterId: 'entity-character',
          locationId: 'entity-location',
          relationStatus: 'present',
          publicationStatus: 'published',
        },
        references,
        [],
      ).valid,
    ).toBe(true);
  });

  test('rejects duplicate pairs before PostgreSQL enforces the primary key', () => {
    const result = validateCharacterLocationRelationDraft(
      {
        characterId: 'entity-character',
        locationId: 'entity-location',
        relationStatus: 'last-seen',
        publicationStatus: 'draft',
      },
      references,
      [existing],
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.locationId).toContain('ya tiene una relación');
  });

  test('rejects archived endpoints and unpublished endpoints for a public relation', () => {
    const archived = validateCharacterLocationRelationDraft(
      {
        characterId: 'entity-character-archived',
        locationId: 'entity-location',
        relationStatus: 'associated',
        publicationStatus: 'draft',
      },
      references,
      [],
    );
    const draftPublic = validateCharacterLocationRelationDraft(
      {
        characterId: 'entity-character-draft',
        locationId: 'entity-location-draft',
        relationStatus: 'associated',
        publicationStatus: 'published',
      },
      references,
      [],
    );
    expect(archived.valid).toBe(false);
    expect(draftPublic.fieldErrors.characterId).toContain('publicado');
    expect(draftPublic.fieldErrors.locationId).toContain('publicado');
  });

  test('keeps endpoints immutable and requires archived relations to return through draft', () => {
    const archived: AdminCharacterLocationRelationRecord = {
      ...existing,
      publicationStatus: 'archived',
      archivedAt: '2026-08-07T01:00:00Z',
    };
    const result = validateCharacterLocationRelationDraft(
      {
        characterId: 'entity-character-draft',
        locationId: 'entity-location',
        relationStatus: 'present',
        publicationStatus: 'published',
      },
      references,
      [archived],
      archived,
    );
    expect(result.fieldErrors.characterId).toContain('no puede cambiar');
    expect(result.fieldErrors.publicationStatus).toContain('borrador');
  });
});
