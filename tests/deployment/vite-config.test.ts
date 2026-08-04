import { describe, expect, it } from 'vitest';

import { resolveViteBase } from '../../vite.config';

describe('Vite base path', () => {
  it('keeps local development and ordinary builds at the domain root', () => {
    expect(resolveViteBase('development', {})).toBe('/');
    expect(resolveViteBase('production', {})).toBe('/');
  });

  it('derives the GitHub Pages subdirectory from GITHUB_REPOSITORY', () => {
    expect(
      resolveViteBase('pages', {
        GITHUB_REPOSITORY: 'EduYube/castigo-divino-map',
      }),
    ).toBe('/castigo-divino-map/');
  });

  it('falls back to the npm package name for local Pages previews', () => {
    expect(
      resolveViteBase('pages', {
        npm_package_name: 'castigo-divino-map',
      }),
    ).toBe('/castigo-divino-map/');
  });

  it('fails explicitly when a Pages base cannot be derived safely', () => {
    expect(() => resolveViteBase('pages', {})).toThrow(/require GITHUB_REPOSITORY/i);
    expect(() =>
      resolveViteBase('pages', {
        npm_package_name: '../unsafe',
      }),
    ).toThrow(/require GITHUB_REPOSITORY/i);
  });
});
