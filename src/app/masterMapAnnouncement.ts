/**
 * Public map announcements survive Master revocation. Only announcements
 * authored from a private pin or an explicitly private search target are
 * discarded. All callers must invalidate pending animation-frame writers too.
 */
export function isMasterOnlyMapAnnouncement(
  announcement: string,
  revokedMasterNames: ReadonlySet<string>,
): boolean {
  if (
    announcement.includes('Contenido del Máster') ||
    announcement.includes('contenido del Máster')
  ) {
    return true;
  }

  for (const name of revokedMasterNames) {
    if (!name) continue;
    if (announcement.startsWith(`${name}, `) || announcement.includes(`en ${name}, `)) {
      return true;
    }
  }
  return false;
}
