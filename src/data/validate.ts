import { FAERUN_MAP_SIZE, type PixelSize } from '../map/config';

const MISSING = Symbol('missing');
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_ID_PATTERN = /^category-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACE_ID_PATTERN = /^place-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NOTE_ID_PATTERN = /^note-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORBIDDEN_PROPERTY_SEGMENTS = new Set([
  'private',
  'secret',
  'spoiler',
  'gm',
  'dm',
  'hidden',
  'future',
]);

export type CampaignDataValidationCode =
  | 'ambiguous-alias'
  | 'coordinate-out-of-bounds'
  | 'duplicate-alias'
  | 'duplicate-id'
  | 'duplicate-reference'
  | 'duplicate-slug'
  | 'forbidden-property'
  | 'invalid-format'
  | 'invalid-search-term'
  | 'invalid-type'
  | 'missing-reference'
  | 'required'
  | 'unknown-property';

export interface CampaignDataValidationIssue {
  readonly code: CampaignDataValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface CampaignDataValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CampaignDataValidationIssue[];
}

interface IndexedValue {
  readonly value: string;
  readonly path: string;
}

interface SearchOwner {
  readonly placePath: string;
  readonly termPath: string;
}

export class CampaignDataValidationError extends Error {
  readonly issues: readonly CampaignDataValidationIssue[];

  constructor(issues: readonly CampaignDataValidationIssue[]) {
    super(
      `Campaign data validation failed with ${issues.length} issue(s):\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`,
    );
    this.name = 'CampaignDataValidationError';
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: CampaignDataValidationIssue[],
  code: CampaignDataValidationCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function normalizePropertyName(property: string): string[] {
  return property
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isForbiddenProperty(property: string): boolean {
  return normalizePropertyName(property).some((segment) =>
    FORBIDDEN_PROPERTY_SEGMENTS.has(segment),
  );
}

function validateStrictRecord(
  value: unknown,
  path: string,
  requiredProperties: readonly string[],
  allowedProperties: readonly string[],
  issues: CampaignDataValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid-type', path, 'Expected an object.');
    return undefined;
  }

  for (const property of requiredProperties) {
    if (!(property in value)) {
      addIssue(issues, 'required', `${path}.${property}`, 'Required field is missing.');
    }
  }

  const allowed = new Set(allowedProperties);

  for (const property of Object.keys(value)) {
    if (allowed.has(property)) {
      continue;
    }

    addIssue(
      issues,
      isForbiddenProperty(property) ? 'forbidden-property' : 'unknown-property',
      `${path}.${property}`,
      isForbiddenProperty(property)
        ? 'Private, secret, hidden, future or game-master-only properties are not allowed.'
        : 'Property is not part of the public campaign data model.',
    );
  }

  return value;
}

function readRequiredField(
  record: Record<string, unknown>,
  property: string,
): unknown | typeof MISSING {
  return property in record ? record[property] : MISSING;
}

function validateNonEmptyString(
  value: unknown | typeof MISSING,
  path: string,
  issues: CampaignDataValidationIssue[],
): value is string {
  if (value === MISSING) {
    return false;
  }

  if (typeof value !== 'string') {
    addIssue(issues, 'invalid-type', path, 'Expected a string.');
    return false;
  }

  if (value.trim().length === 0) {
    addIssue(issues, 'required', path, 'Required text must not be empty.');
    return false;
  }

  return true;
}

function validatePattern(
  value: unknown | typeof MISSING,
  path: string,
  pattern: RegExp,
  description: string,
  issues: CampaignDataValidationIssue[],
): value is string {
  if (!validateNonEmptyString(value, path, issues)) {
    return false;
  }

  if (!pattern.test(value)) {
    addIssue(issues, 'invalid-format', path, description);
    return false;
  }

  return true;
}

function validateArray(
  value: unknown | typeof MISSING,
  path: string,
  issues: CampaignDataValidationIssue[],
): readonly unknown[] | undefined {
  if (value === MISSING) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    addIssue(issues, 'invalid-type', path, 'Expected an array.');
    return undefined;
  }

  return value;
}

function validateStringArray(
  value: unknown | typeof MISSING,
  path: string,
  issues: CampaignDataValidationIssue[],
  itemPattern?: RegExp,
  formatDescription?: string,
): readonly string[] {
  const values = validateArray(value, path, issues);

  if (!values) {
    return [];
  }

  const validValues: string[] = [];

  values.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;

    if (!validateNonEmptyString(item, itemPath, issues)) {
      return;
    }

    if (itemPattern && !itemPattern.test(item)) {
      addIssue(
        issues,
        'invalid-format',
        itemPath,
        formatDescription ?? 'Value has an invalid format.',
      );
      return;
    }

    validValues.push(item);
  });

  return validValues;
}

function validateCoordinate(
  value: unknown | typeof MISSING,
  path: string,
  mapSize: PixelSize,
  issues: CampaignDataValidationIssue[],
): void {
  if (value === MISSING) {
    return;
  }

  const coordinate = validateStrictRecord(value, path, ['x', 'y'], ['x', 'y'], issues);

  if (!coordinate) {
    return;
  }

  const axes = [
    ['x', mapSize.width],
    ['y', mapSize.height],
  ] as const;

  for (const [axis, maximum] of axes) {
    const axisValue = readRequiredField(coordinate, axis);
    const axisPath = `${path}.${axis}`;

    if (axisValue === MISSING) {
      continue;
    }

    if (typeof axisValue !== 'number' || !Number.isFinite(axisValue)) {
      addIssue(issues, 'invalid-type', axisPath, 'Coordinate must be a finite number.');
      continue;
    }

    if (axisValue < 0 || axisValue > maximum) {
      addIssue(
        issues,
        'coordinate-out-of-bounds',
        axisPath,
        `Coordinate must be between 0 and ${maximum}, inclusive.`,
      );
    }
  }
}

function validateCategory(
  value: unknown,
  index: number,
  issues: CampaignDataValidationIssue[],
): void {
  const path = `$.categories[${index}]`;
  const record = validateStrictRecord(
    value,
    path,
    ['id', 'slug', 'name', 'description'],
    ['id', 'slug', 'name', 'description'],
    issues,
  );

  if (!record) {
    return;
  }

  validatePattern(
    readRequiredField(record, 'id'),
    `${path}.id`,
    CATEGORY_ID_PATTERN,
    'Category ID must start with "category-" and use lowercase kebab-case.',
    issues,
  );
  validatePattern(
    readRequiredField(record, 'slug'),
    `${path}.slug`,
    KEBAB_CASE_PATTERN,
    'Slug must use lowercase kebab-case.',
    issues,
  );
  validateNonEmptyString(readRequiredField(record, 'name'), `${path}.name`, issues);
  validateNonEmptyString(
    readRequiredField(record, 'description'),
    `${path}.description`,
    issues,
  );
}

function validateTag(
  value: unknown,
  index: number,
  issues: CampaignDataValidationIssue[],
): void {
  const path = `$.tags[${index}]`;
  const record = validateStrictRecord(
    value,
    path,
    ['id', 'name', 'description'],
    ['id', 'name', 'description'],
    issues,
  );

  if (!record) {
    return;
  }

  validatePattern(
    readRequiredField(record, 'id'),
    `${path}.id`,
    KEBAB_CASE_PATTERN,
    'Tag ID must use lowercase kebab-case.',
    issues,
  );
  validateNonEmptyString(readRequiredField(record, 'name'), `${path}.name`, issues);
  validateNonEmptyString(
    readRequiredField(record, 'description'),
    `${path}.description`,
    issues,
  );
}

function validatePlace(
  value: unknown,
  index: number,
  mapSize: PixelSize,
  issues: CampaignDataValidationIssue[],
): void {
  const path = `$.places[${index}]`;
  const record = validateStrictRecord(
    value,
    path,
    ['id', 'slug', 'name', 'aliases', 'coordinates', 'categoryId', 'tagIds'],
    ['id', 'slug', 'name', 'aliases', 'coordinates', 'categoryId', 'tagIds'],
    issues,
  );

  if (!record) {
    return;
  }

  validatePattern(
    readRequiredField(record, 'id'),
    `${path}.id`,
    PLACE_ID_PATTERN,
    'Place ID must start with "place-" and use lowercase kebab-case.',
    issues,
  );
  validatePattern(
    readRequiredField(record, 'slug'),
    `${path}.slug`,
    KEBAB_CASE_PATTERN,
    'Slug must use lowercase kebab-case.',
    issues,
  );
  validateNonEmptyString(readRequiredField(record, 'name'), `${path}.name`, issues);
  validateStringArray(readRequiredField(record, 'aliases'), `${path}.aliases`, issues);
  validateCoordinate(
    readRequiredField(record, 'coordinates'),
    `${path}.coordinates`,
    mapSize,
    issues,
  );
  validatePattern(
    readRequiredField(record, 'categoryId'),
    `${path}.categoryId`,
    CATEGORY_ID_PATTERN,
    'Category reference must use a valid category ID.',
    issues,
  );
  validateStringArray(
    readRequiredField(record, 'tagIds'),
    `${path}.tagIds`,
    issues,
    KEBAB_CASE_PATTERN,
    'Tag reference must use lowercase kebab-case.',
  );
}

function validateNote(
  value: unknown,
  index: number,
  issues: CampaignDataValidationIssue[],
): void {
  const path = `$.notes[${index}]`;
  const record = validateStrictRecord(
    value,
    path,
    ['id', 'slug', 'placeId', 'title', 'body', 'tagIds'],
    ['id', 'slug', 'placeId', 'title', 'body', 'tagIds'],
    issues,
  );

  if (!record) {
    return;
  }

  validatePattern(
    readRequiredField(record, 'id'),
    `${path}.id`,
    NOTE_ID_PATTERN,
    'Note ID must start with "note-" and use lowercase kebab-case.',
    issues,
  );
  validatePattern(
    readRequiredField(record, 'slug'),
    `${path}.slug`,
    KEBAB_CASE_PATTERN,
    'Slug must use lowercase kebab-case.',
    issues,
  );
  validatePattern(
    readRequiredField(record, 'placeId'),
    `${path}.placeId`,
    PLACE_ID_PATTERN,
    'Place reference must use a valid place ID.',
    issues,
  );
  validateNonEmptyString(readRequiredField(record, 'title'), `${path}.title`, issues);
  validateNonEmptyString(readRequiredField(record, 'body'), `${path}.body`, issues);
  validateStringArray(
    readRequiredField(record, 'tagIds'),
    `${path}.tagIds`,
    issues,
    KEBAB_CASE_PATTERN,
    'Tag reference must use lowercase kebab-case.',
  );
}

function getRecords(values: readonly unknown[] | undefined): readonly Record<string, unknown>[] {
  return values?.filter(isRecord) ?? [];
}

function collectStringFields(
  records: readonly Record<string, unknown>[],
  collectionPath: string,
  field: string,
): readonly IndexedValue[] {
  const values: IndexedValue[] = [];

  records.forEach((record, index) => {
    const value = record[field];

    if (typeof value === 'string' && value.trim().length > 0) {
      values.push({ value, path: `${collectionPath}[${index}].${field}` });
    }
  });

  return values;
}

function reportDuplicates(
  values: readonly IndexedValue[],
  code: 'duplicate-id' | 'duplicate-slug',
  label: string,
  issues: CampaignDataValidationIssue[],
): void {
  const firstPaths = new Map<string, string>();

  for (const entry of values) {
    const firstPath = firstPaths.get(entry.value);

    if (firstPath) {
      addIssue(
        issues,
        code,
        entry.path,
        `${label} "${entry.value}" duplicates ${firstPath}.`,
      );
    } else {
      firstPaths.set(entry.value, entry.path);
    }
  }
}

function reportDuplicateReferences(
  record: Record<string, unknown>,
  path: string,
  field: string,
  issues: CampaignDataValidationIssue[],
): void {
  const values = record[field];

  if (!Array.isArray(values)) {
    return;
  }

  const seen = new Set<string>();

  values.forEach((value, index) => {
    if (typeof value !== 'string') {
      return;
    }

    if (seen.has(value)) {
      addIssue(
        issues,
        'duplicate-reference',
        `${path}.${field}[${index}]`,
        `Reference "${value}" is repeated in the same entity.`,
      );
    } else {
      seen.add(value);
    }
  });
}

function reportMissingReference(
  value: unknown,
  validIds: ReadonlySet<string>,
  path: string,
  label: string,
  issues: CampaignDataValidationIssue[],
): void {
  if (typeof value === 'string' && !validIds.has(value)) {
    addIssue(issues, 'missing-reference', path, `${label} "${value}" does not exist.`);
  }
}

function validateReferences(
  places: readonly Record<string, unknown>[],
  notes: readonly Record<string, unknown>[],
  categoryIds: ReadonlySet<string>,
  tagIds: ReadonlySet<string>,
  placeIds: ReadonlySet<string>,
  issues: CampaignDataValidationIssue[],
): void {
  places.forEach((place, index) => {
    const path = `$.places[${index}]`;
    reportMissingReference(
      place.categoryId,
      categoryIds,
      `${path}.categoryId`,
      'Category',
      issues,
    );
    reportDuplicateReferences(place, path, 'tagIds', issues);

    if (Array.isArray(place.tagIds)) {
      place.tagIds.forEach((tagId, tagIndex) =>
        reportMissingReference(tagId, tagIds, `${path}.tagIds[${tagIndex}]`, 'Tag', issues),
      );
    }
  });

  notes.forEach((note, index) => {
    const path = `$.notes[${index}]`;
    reportMissingReference(note.placeId, placeIds, `${path}.placeId`, 'Place', issues);
    reportDuplicateReferences(note, path, 'tagIds', issues);

    if (Array.isArray(note.tagIds)) {
      note.tagIds.forEach((tagId, tagIndex) =>
        reportMissingReference(tagId, tagIds, `${path}.tagIds[${tagIndex}]`, 'Tag', issues),
      );
    }
  });
}

export function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validateAliasAmbiguity(
  places: readonly Record<string, unknown>[],
  issues: CampaignDataValidationIssue[],
): void {
  const globalOwners = new Map<string, SearchOwner>();

  places.forEach((place, placeIndex) => {
    const placePath = `$.places[${placeIndex}]`;
    const terms: IndexedValue[] = [];

    if (typeof place.name === 'string') {
      terms.push({ value: place.name, path: `${placePath}.name` });
    }

    if (Array.isArray(place.aliases)) {
      place.aliases.forEach((alias, aliasIndex) => {
        if (typeof alias === 'string') {
          terms.push({ value: alias, path: `${placePath}.aliases[${aliasIndex}]` });
        }
      });
    }

    const localTerms = new Map<string, string>();

    for (const term of terms) {
      const normalized = normalizeSearchTerm(term.value);

      if (!normalized) {
        addIssue(
          issues,
          'invalid-search-term',
          term.path,
          'Name or alias must contain searchable letters or numbers.',
        );
        continue;
      }

      const localPath = localTerms.get(normalized);

      if (localPath) {
        addIssue(
          issues,
          'duplicate-alias',
          term.path,
          `Search term duplicates ${localPath} after normalization.`,
        );
      } else {
        localTerms.set(normalized, term.path);
      }

      const globalOwner = globalOwners.get(normalized);

      if (globalOwner && globalOwner.placePath !== placePath) {
        addIssue(
          issues,
          'ambiguous-alias',
          term.path,
          `Search term is ambiguous with ${globalOwner.termPath} after normalization.`,
        );
      } else if (!globalOwner) {
        globalOwners.set(normalized, { placePath, termPath: term.path });
      }
    }
  });
}

export function validateCampaignData(
  value: unknown,
  mapSize: PixelSize = FAERUN_MAP_SIZE,
): CampaignDataValidationResult {
  const issues: CampaignDataValidationIssue[] = [];
  const catalog = validateStrictRecord(
    value,
    '$',
    ['categories', 'tags', 'places', 'notes'],
    ['categories', 'tags', 'places', 'notes'],
    issues,
  );

  if (!catalog) {
    return { valid: false, issues };
  }

  const categories = validateArray(
    readRequiredField(catalog, 'categories'),
    '$.categories',
    issues,
  );
  const tags = validateArray(readRequiredField(catalog, 'tags'), '$.tags', issues);
  const places = validateArray(readRequiredField(catalog, 'places'), '$.places', issues);
  const notes = validateArray(readRequiredField(catalog, 'notes'), '$.notes', issues);

  categories?.forEach((category, index) => validateCategory(category, index, issues));
  tags?.forEach((tag, index) => validateTag(tag, index, issues));
  places?.forEach((place, index) => validatePlace(place, index, mapSize, issues));
  notes?.forEach((note, index) => validateNote(note, index, issues));

  const categoryRecords = getRecords(categories);
  const tagRecords = getRecords(tags);
  const placeRecords = getRecords(places);
  const noteRecords = getRecords(notes);

  const categoryIdEntries = collectStringFields(categoryRecords, '$.categories', 'id');
  const tagIdEntries = collectStringFields(tagRecords, '$.tags', 'id');
  const placeIdEntries = collectStringFields(placeRecords, '$.places', 'id');
  const noteIdEntries = collectStringFields(noteRecords, '$.notes', 'id');

  reportDuplicates(
    [...categoryIdEntries, ...tagIdEntries, ...placeIdEntries, ...noteIdEntries],
    'duplicate-id',
    'Stable ID',
    issues,
  );
  reportDuplicates(
    [
      ...collectStringFields(categoryRecords, '$.categories', 'slug'),
      ...collectStringFields(placeRecords, '$.places', 'slug'),
      ...collectStringFields(noteRecords, '$.notes', 'slug'),
    ],
    'duplicate-slug',
    'Slug',
    issues,
  );

  validateReferences(
    placeRecords,
    noteRecords,
    new Set(categoryIdEntries.map(({ value: id }) => id)),
    new Set(tagIdEntries.map(({ value: id }) => id)),
    new Set(placeIdEntries.map(({ value: id }) => id)),
    issues,
  );
  validateAliasAmbiguity(placeRecords, issues);

  return { valid: issues.length === 0, issues };
}

export function assertValidCampaignData(
  value: unknown,
  mapSize: PixelSize = FAERUN_MAP_SIZE,
): void {
  const result = validateCampaignData(value, mapSize);

  if (!result.valid) {
    throw new CampaignDataValidationError(result.issues);
  }
}
