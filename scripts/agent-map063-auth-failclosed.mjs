import fs from 'node:fs';

const path = 'src/app/publicNotes.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
`function describeRepositoryError(error: unknown): string {
  if (!(error instanceof PublicNoteRepositoryError)) {`,
`function isAuthorizationFailure(error: unknown): boolean {
  return (
    error instanceof PublicNoteRepositoryError &&
    (error.code === 'unauthorized' || error.code === 'forbidden')
  );
}

function describeRepositoryError(error: unknown): string {
  if (!(error instanceof PublicNoteRepositoryError)) {`,
'authorization helper',
);

replaceOnce(
`    const error = appendText(form, 'p', 'public-notes__error', '');
    error.setAttribute('aria-live', 'assertive');`,
`    const error = appendText(form, 'p', 'public-notes__error', '');
    error.setAttribute('aria-live', 'assertive');
    error.tabIndex = -1;`,
'edit error focus target',
);

replaceOnce(
`        .catch((errorValue) => {
          error.textContent = describeRepositoryError(errorValue);
          error.focus?.();
        })`,
`        .catch((errorValue) => {
          if (isAuthorizationFailure(errorValue)) {
            mode = 'unverified';
            authAdapter?.dispose();
            authAdapter = null;
            setFormAvailable(false);
            renderList();
            announce(describeRepositoryError(errorValue), true);
            elements.status.focus({ preventScroll: true });
            return;
          }
          error.textContent = describeRepositoryError(errorValue);
          error.focus({ preventScroll: true });
        })`,
'edit authorization failure',
);

replaceOnce(
`        .catch((errorValue) => {
          announce(describeRepositoryError(errorValue), true);
          elements.status.focus({ preventScroll: true });
          renderList();
        })`,
`        .catch((errorValue) => {
          if (isAuthorizationFailure(errorValue)) {
            mode = 'unverified';
            authAdapter?.dispose();
            authAdapter = null;
            setFormAvailable(false);
          }
          announce(describeRepositoryError(errorValue), true);
          elements.status.focus({ preventScroll: true });
          renderList();
        })`,
'archive authorization failure',
);

replaceOnce(
`      .catch((error) => {
        announce(describeRepositoryError(error), true);
        elements.status.focus({ preventScroll: true });
      })`,
`      .catch((error) => {
        if (isAuthorizationFailure(error)) {
          mode = 'unverified';
          authAdapter?.dispose();
          authAdapter = null;
          setFormAvailable(false);
          renderList();
        }
        announce(describeRepositoryError(error), true);
        elements.status.focus({ preventScroll: true });
      })`,
'create authorization failure',
);

fs.writeFileSync(path, source);
