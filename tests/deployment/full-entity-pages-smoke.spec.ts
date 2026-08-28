import { expect, test, type Request } from '@playwright/test';

function generatedResourceRequests(requests: readonly Request[]): readonly Request[] {
  return requests.filter((request) => /\.(?:css|js)(?:\?|$)/.test(request.url()));
}

test('loads a direct full-entity URL under the GitHub Pages subdirectory', async ({
  page,
  baseURL,
}) => {
  const requests: Request[] = [];
  const failedResponses: string[] = [];

  page.on('request', (request) => requests.push(request));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto('?entity=map024-smoke-missing');

  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Entidad no disponible' }),
  ).toBeVisible();
  await expect(page).toHaveTitle('Entidad no disponible · El Atlas de los Nuevos Dioses');
  const mapLink = page.getByRole('link', { name: 'Volver al mapa' });
  const mapHref = await mapLink.getAttribute('href');
  expect(mapHref).not.toBeNull();
  const mapUrl = new URL(mapHref!, page.url());
  expect(mapUrl.pathname).toMatch(/\/$/);
  expect(mapUrl.searchParams.get('campaign')).toBe('castigo-divino');
  await expect(page.getByText('Contenido de fans no oficial', { exact: true })).toBeVisible();

  const expectedPathname = new URL(baseURL ?? page.url()).pathname;
  const canonicalEntityUrl = new URL(page.url());
  expect(canonicalEntityUrl.pathname).toBe(expectedPathname);
  expect(canonicalEntityUrl.searchParams.get('entity')).toBe('map024-smoke-missing');
  expect(canonicalEntityUrl.searchParams.get('campaign')).toBe('castigo-divino');
  expect(generatedResourceRequests(requests).length).toBeGreaterThanOrEqual(2);

  for (const request of generatedResourceRequests(requests)) {
    expect(new URL(request.url()).pathname.startsWith(`${expectedPathname}assets/`)).toBe(true);
  }

  expect(failedResponses).toEqual([]);

  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Entidad no disponible' }),
  ).toBeVisible();
  const reloadedEntityUrl = new URL(page.url());
  expect(reloadedEntityUrl.searchParams.get('entity')).toBe('map024-smoke-missing');
  expect(reloadedEntityUrl.searchParams.get('campaign')).toBe('castigo-divino');
});
