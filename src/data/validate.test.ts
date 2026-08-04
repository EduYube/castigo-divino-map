import { describe, expect, it } from 'vitest';

import { campaignCatalog } from './catalog';
import { toLeafletSimpleCoordinate } from './coordinates';
import {
  CampaignDataValidationError,
  assertValidCampaignData,
  validateCampaignData,
  type CampaignDataValidationCode,
} from './validate';

function expectIssue(value: unknown, code: CampaignDataValidationCode): void {
  const result = validateCampaignData(value);

  expect(result.valid).toBe(false);
  expect(result.issues.some((issue) => issue.code === code)).toBe(true);
}

describe('campaign data validation', () => {
  it('accepts the public demonstration catalog', () => {
    expect(validateCampaignData(campaignCatalog)).toEqual({ valid: true, issues: [] });
    expect(() => assertValidCampaignData(campaignCatalog)).not.toThrow();
  });

  it('maps image x/y coordinates to Leaflet y/x coordinates', () => {
    expect(toLeafletSimpleCoordinate({ x: 1080.5, y: 820 })).toEqual([820, 1080.5]);
  });

  it('rejects duplicate stable IDs and slugs', () => {
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          campaignCatalog.places[0],
          {
            ...campaignCatalog.places[1],
            id: campaignCatalog.places[0].id,
            slug: campaignCatalog.places[0].slug,
          },
        ],
      },
      'duplicate-id',
    );
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          campaignCatalog.places[0],
          {
            ...campaignCatalog.places[1],
            slug: campaignCatalog.places[0].slug,
          },
        ],
      },
      'duplicate-slug',
    );
  });

  it('rejects invalid identifiers and tag IDs outside kebab-case', () => {
    expectIssue(
      {
        ...campaignCatalog,
        tags: [{ ...campaignCatalog.tags[0], id: 'Not Kebab Case' }, ...campaignCatalog.tags.slice(1)],
      },
      'invalid-format',
    );
  });

  it('rejects missing category, tag and place references', () => {
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          {
            ...campaignCatalog.places[0],
            categoryId: 'category-unknown',
            tagIds: ['unknown-tag'],
          },
          campaignCatalog.places[1],
        ],
        notes: [
          {
            ...campaignCatalog.notes[0],
            placeId: 'place-unknown',
          },
          campaignCatalog.notes[1],
        ],
      },
      'missing-reference',
    );
  });

  it('rejects coordinates outside the 3600 by 2329 image bounds', () => {
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          {
            ...campaignCatalog.places[0],
            coordinates: { x: 3600.01, y: -0.01 },
          },
          campaignCatalog.places[1],
        ],
      },
      'coordinate-out-of-bounds',
    );
  });

  it('rejects missing and empty required fields', () => {
    const placeWithoutName: Record<string, unknown> = { ...campaignCatalog.places[0] };
    delete placeWithoutName.name;

    expectIssue(
      {
        ...campaignCatalog,
        places: [placeWithoutName, campaignCatalog.places[1]],
        notes: [{ ...campaignCatalog.notes[0], body: '   ' }, campaignCatalog.notes[1]],
      },
      'required',
    );
  });

  it('rejects aliases that become ambiguous after search normalization', () => {
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          campaignCatalog.places[0],
          {
            ...campaignCatalog.places[1],
            aliases: ['PUERTO DE EJEMPLO'],
          },
        ],
      },
      'ambiguous-alias',
    );
  });

  it('rejects duplicate aliases inside one place', () => {
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          {
            ...campaignCatalog.places[0],
            aliases: ['Puerto de ejemplo', 'puerto-de-ejemplo'],
          },
          campaignCatalog.places[1],
        ],
      },
      'duplicate-alias',
    );
  });

  it('rejects structurally private or unsupported properties', () => {
    expectIssue(
      {
        ...campaignCatalog,
        places: [
          {
            ...campaignCatalog.places[0],
            gmNotes: 'Este campo no debe formar parte del frontend público.',
          },
          campaignCatalog.places[1],
        ],
      },
      'forbidden-property',
    );
  });

  it('throws a structured error when assertion validation fails', () => {
    expect(() =>
      assertValidCampaignData({
        ...campaignCatalog,
        notes: [{ ...campaignCatalog.notes[0], title: '' }, campaignCatalog.notes[1]],
      }),
    ).toThrow(CampaignDataValidationError);
  });
});
