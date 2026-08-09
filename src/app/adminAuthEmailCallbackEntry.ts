import { mountAdminAuthEmailCallback } from './adminAuthEmailCallback';

const sourceUrl = new URL(window.location.href);
const fragment = sourceUrl.hash.startsWith('#') ? sourceUrl.hash.slice(1) : sourceUrl.hash;
const fragmentParams = new URLSearchParams(fragment);
const containsAuthCredential =
  fragmentParams.has('access_token') || fragmentParams.has('refresh_token');

mountAdminAuthEmailCallback(document.body);

if (containsAuthCredential && window.location.hash) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.hash = '';
  window.history.replaceState(window.history.state, '', cleanUrl);
}
