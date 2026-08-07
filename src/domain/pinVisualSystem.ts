export type PinEntityType = 'character' | 'location';
export type PinDisposition = 'ally' | 'enemy' | 'neutral';
export type PinDispositionState = PinDisposition | 'unknown';

export interface PinTypeVisual {
  readonly type: PinEntityType;
  readonly label: string;
  readonly symbol: string;
  readonly className: string;
}

export interface PinDispositionVisual {
  readonly disposition: PinDispositionState;
  readonly label: string;
  readonly symbol: string;
  readonly className: string;
}

export interface PinPlayerDispositionInput {
  readonly playerId: string;
  readonly playerName: string;
  readonly disposition: PinDisposition | null | undefined;
}

export interface PinPlayerDispositionVisual extends PinDispositionVisual {
  readonly playerId: string;
  readonly playerName: string;
}

export interface CoordinatePin {
  readonly id: string;
  readonly coordinate: readonly [number, number];
}

const TYPE_VISUALS: Record<PinEntityType, PinTypeVisual> = {
  character: {
    type: 'character',
    label: 'Personaje',
    symbol: '●',
    className: 'pin-visual--character',
  },
  location: {
    type: 'location',
    label: 'Emplazamiento',
    symbol: '◆',
    className: 'pin-visual--location',
  },
};

const DISPOSITION_VISUALS: Record<PinDispositionState, PinDispositionVisual> = {
  ally: {
    disposition: 'ally',
    label: 'Aliado',
    symbol: '+',
    className: 'pin-disposition--ally',
  },
  enemy: {
    disposition: 'enemy',
    label: 'Enemigo',
    symbol: '−',
    className: 'pin-disposition--enemy',
  },
  neutral: {
    disposition: 'neutral',
    label: 'Neutral',
    symbol: '•',
    className: 'pin-disposition--neutral',
  },
  unknown: {
    disposition: 'unknown',
    label: 'Sin disposición disponible',
    symbol: '?',
    className: 'pin-disposition--unknown',
  },
};

export function getPinTypeVisual(entityType: PinEntityType): PinTypeVisual {
  return TYPE_VISUALS[entityType];
}

export function getPinDispositionVisual(
  disposition: PinDisposition | null | undefined,
): PinDispositionVisual {
  return DISPOSITION_VISUALS[disposition ?? 'unknown'];
}

export function createPlayerDispositionVisuals(
  dispositions: readonly PinPlayerDispositionInput[],
): readonly PinPlayerDispositionVisual[] {
  if (dispositions.length === 0) {
    return [
      {
        playerId: 'unknown',
        playerName: 'Perspectiva no disponible',
        ...DISPOSITION_VISUALS.unknown,
      },
    ];
  }

  return dispositions.map(({ playerId, playerName, disposition }) => ({
    playerId,
    playerName,
    ...getPinDispositionVisual(disposition),
  }));
}

export function describePlayerDispositions(
  dispositions: readonly PinPlayerDispositionInput[],
): string {
  return createPlayerDispositionVisuals(dispositions)
    .map(({ playerName, label }) => `${playerName}: ${label.toLocaleLowerCase('es')}`)
    .join('; ');
}

export function coordinateGroupKey(coordinate: readonly [number, number]): string {
  return `${coordinate[0]}:${coordinate[1]}`;
}

export function groupPinsByCoordinate<T extends CoordinatePin>(
  pins: readonly T[],
): readonly (readonly T[])[] {
  const groups = new Map<string, T[]>();

  for (const pin of pins) {
    const key = coordinateGroupKey(pin.coordinate);
    const group = groups.get(key);

    if (group) {
      group.push(pin);
    } else {
      groups.set(key, [pin]);
    }
  }

  return Array.from(groups.values());
}
