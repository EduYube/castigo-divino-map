export type PublicationStatus = 'draft' | 'published' | 'archived';
export type AdminCatalogResourceKind =
  'category' | 'tag' | 'entity-alias' | 'geographic-name' | 'geographic-alias';

export interface AdminCatalogRecordBase {
  readonly kind: AdminCatalogResourceKind;
  readonly id: string;
  readonly publicationStatus: PublicationStatus;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminCategory extends AdminCatalogRecordBase {
  readonly kind: 'category';
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface AdminTag extends AdminCatalogRecordBase {
  readonly kind: 'tag';
  readonly name: string;
  readonly description: string;
}

export interface AdminEntityAlias extends AdminCatalogRecordBase {
  readonly kind: 'entity-alias';
  readonly entityId: string;
  readonly language: 'en';
  readonly value: string;
}

export interface AdminGeographicName extends AdminCatalogRecordBase {
  readonly kind: 'geographic-name';
  readonly slug: string;
  readonly name: string;
  readonly language: 'en';
  readonly x: number;
  readonly y: number;
  readonly recommendedZoom: number | null;
  readonly entityId: string | null;
}

export interface AdminGeographicAlias extends AdminCatalogRecordBase {
  readonly kind: 'geographic-alias';
  readonly geographicNameId: string;
  readonly language: 'en';
  readonly value: string;
}

export type AdminCatalogRecord =
  AdminCategory | AdminTag | AdminEntityAlias | AdminGeographicName | AdminGeographicAlias;

export interface AdminEntityReference {
  readonly id: string;
  readonly name: string;
  readonly entityType: 'character' | 'location';
  readonly publicationStatus: PublicationStatus;
}

export interface AdminGeographicNameReference {
  readonly id: string;
  readonly name: string;
  readonly publicationStatus: PublicationStatus;
}

export type AdminCatalogDraft =
  | {
      readonly kind: 'category';
      readonly id: string;
      readonly slug: string;
      readonly name: string;
      readonly description: string;
      readonly publicationStatus: PublicationStatus;
    }
  | {
      readonly kind: 'tag';
      readonly id: string;
      readonly name: string;
      readonly description: string;
      readonly publicationStatus: PublicationStatus;
    }
  | {
      readonly kind: 'entity-alias';
      readonly id: string;
      readonly entityId: string;
      readonly language: 'en';
      readonly value: string;
      readonly publicationStatus: PublicationStatus;
    }
  | {
      readonly kind: 'geographic-name';
      readonly id: string;
      readonly slug: string;
      readonly name: string;
      readonly language: 'en';
      readonly x: number;
      readonly y: number;
      readonly recommendedZoom: number | null;
      readonly entityId: string | null;
      readonly publicationStatus: PublicationStatus;
    }
  | {
      readonly kind: 'geographic-alias';
      readonly id: string;
      readonly geographicNameId: string;
      readonly language: 'en';
      readonly value: string;
      readonly publicationStatus: PublicationStatus;
    };

export const ADMIN_RESOURCE_LABELS: Readonly<Record<AdminCatalogResourceKind, string>> = {
  category: 'Categorías',
  tag: 'Etiquetas',
  'entity-alias': 'Nombres alternativos de entidades',
  'geographic-name': 'Nombres geográficos',
  'geographic-alias': 'Nombres geográficos alternativos',
};

export function getAdminRecordDisplayName(record: AdminCatalogRecord): string {
  switch (record.kind) {
    case 'category':
    case 'tag':
      return record.name;
    case 'entity-alias':
    case 'geographic-alias':
      return record.value;
    case 'geographic-name':
      return record.name;
  }
}
