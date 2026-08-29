import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (source.includes(after)) return false;
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${path}: expected one patch target, found ${occurrences}`);
  }
  await writeFile(path, source.replace(before, after));
  return true;
}

await replaceOnce(
  'src/domain/adminMapEntities.ts',
  '  readonly playerAssociationIds: readonly string[];',
  '  readonly playerAssociationIds?: readonly string[];',
);

await replaceOnce(
  'src/infrastructure/supabase/adminMapEntityRepository.ts',
  '          p_player_association_ids: [...draft.playerAssociationIds],',
  '          p_player_association_ids: [...(draft.playerAssociationIds ?? [])],',
);

await replaceOnce(
  'src/domain/adminMapEntityValidation.ts',
  `  const dispositionIds = draft.dispositions.map(({ playerId }) => playerId);`,
  `  const associationIds = draft.playerAssociationIds ?? [];
  const uniqueAssociationIds = new Set(associationIds);
  if (uniqueAssociationIds.size !== associationIds.length) {
    setError(errors, 'playerAssociationIds', 'Un personaje solo puede asociarse una vez.');
  }
  for (const playerId of uniqueAssociationIds) {
    const player = references.players.find((candidate) => candidate.id === playerId);
    if (!player || player.publicationStatus === 'archived') {
      setError(
        errors,
        'playerAssociationIds',
        'La selección contiene un personaje que ya no está disponible en esta campaña.',
      );
      break;
    }
  }

  const dispositionIds = draft.dispositions.map(({ playerId }) => playerId);`,
);

const cssPath = 'src/styles/pin-player-associations.css';
let css = await readFile(cssPath, 'utf8');
if (!css.includes('.player-association-accent {')) {
  css += `
.player-association-accent {
  display: inline-block;
  width: 0.95rem;
  height: 0.95rem;
  flex: 0 0 auto;
  background: var(--player-association-accent, CanvasText);
  border: 2px solid CanvasText;
  border-radius: 50%;
}

@media (forced-colors: active) {
  .player-association-accent {
    background: Canvas;
    border-style: double;
    border-width: 4px;
    forced-color-adjust: auto;
  }
}
`;
  await writeFile(cssPath, css);
}
