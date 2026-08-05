import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  isBinaryContent,
  scanTrackedContent,
} from '../scripts/verify-supabase-security.mjs';

describe('Supabase tracked-file security audit', () => {
  it('detects a private key in a PEM file', () => {
    const privateKeyHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const result = scanTrackedContent('deploy.pem', Buffer.from(privateKeyHeader));

    expect(result.findings).toEqual(['deploy.pem: private key']);
  });

  it('detects a Supabase secret key in a Dockerfile', () => {
    const secretKey = ['sb', 'secret', 'a'.repeat(24)].join('_');
    const result = scanTrackedContent('Dockerfile', Buffer.from(`ENV KEY=${secretKey}`));

    expect(result.findings).toEqual(['Dockerfile: Supabase secret key']);
  });

  it('detects privileged assignments in extensionless and npm configuration files', () => {
    const password = 'b'.repeat(24);
    const npmResult = scanTrackedContent(
      '.npmrc',
      Buffer.from(`SUPABASE_DB_PASSWORD=${password}`),
    );
    const token = ['sbp', 'c'.repeat(24)].join('_');
    const scriptResult = scanTrackedContent(
      'deploy',
      Buffer.from(`SUPABASE_ACCESS_TOKEN=${token}`),
    );

    expect(npmResult.findings).toEqual([
      '.npmrc: non-placeholder SUPABASE_DB_PASSWORD assignment',
    ]);
    expect(scriptResult.findings).toEqual([
      'deploy: Supabase management access token',
      'deploy: non-placeholder SUPABASE_ACCESS_TOKEN assignment',
    ]);
  });

  it('detects a credentialed PostgreSQL URL in a PowerShell script', () => {
    const databaseUrl = ['postgresql://operator', 'password@db.example.invalid/postgres'].join(':');
    const result = scanTrackedContent('deploy.ps1', Buffer.from(`$url = '${databaseUrl}'`));

    expect(result.findings).toEqual([
      'deploy.ps1: PostgreSQL URL with an embedded password',
    ]);
  });

  it('accepts documented placeholders', () => {
    const result = scanTrackedContent(
      '.env.example',
      Buffer.from(
        [
          'SUPABASE_ACCESS_TOKEN=<REDACTED>',
          'SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD}',
          'SUPABASE_SERVICE_ROLE_KEY=example-only',
        ].join('\n'),
      ),
    );

    expect(result.findings).toEqual([]);
  });

  it('skips content containing null bytes as binary', () => {
    const binary = Buffer.from([0x50, 0x4e, 0x47, 0x00, 0x01]);

    expect(isBinaryContent(binary)).toBe(true);
    expect(scanTrackedContent('image.png', binary)).toEqual({
      findings: [],
      skippedBinary: true,
    });
  });
});
