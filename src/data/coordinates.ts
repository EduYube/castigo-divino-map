import type { CampaignCoordinate } from './model';

export type LeafletSimpleCoordinate = readonly [number, number];

export function toLeafletSimpleCoordinate({ x, y }: CampaignCoordinate): LeafletSimpleCoordinate {
  return [y, x];
}

export function fromLeafletSimpleCoordinate(
  coordinate: LeafletSimpleCoordinate,
): CampaignCoordinate {
  return { x: coordinate[1], y: coordinate[0] };
}
