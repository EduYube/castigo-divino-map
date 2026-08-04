import type { CampaignCoordinate } from './model';

export type LeafletSimpleCoordinate = readonly [number, number];

export function toLeafletSimpleCoordinate({
  x,
  y,
}: CampaignCoordinate): LeafletSimpleCoordinate {
  return [y, x];
}
