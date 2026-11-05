import { describe, expect, it, vi } from 'vitest';
import { pgConfig } from '../src/db/pool.js';

const SUPA = 'postgresql://postgres.abcd:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require';
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('pgConfig (TLS for Supabase)', () => {
  it('leaves local connection strings untouched', () => {
    expect(pgConfig('postgresql://localnorm:localnorm@localhost:5433/localnorm', {})).toEqual({
      connectionString: 'postgresql://localnorm:localnorm@localhost:5433/localnorm',
    });
  });

  it('encrypts Supabase connections by default, strips sslmode so it cannot override, and warns about verification', () => {
    const warn = vi.fn();
    const c = pgConfig(SUPA, {}, warn);
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain('sslmode');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('verifies the certificate when a CA (PEM text) is provided', () => {
    const warn = vi.fn();
    const c = pgConfig(SUPA, { DATABASE_SSL_CA: PEM }, warn);
    expect(c.ssl).toMatchObject({ rejectUnauthorized: true, ca: expect.stringContaining('\nMIIB\n') });
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects verify without a CA and unknown modes', () => {
    expect(() => pgConfig(SUPA, { DATABASE_SSL: 'verify' })).toThrow(/DATABASE_SSL_CA/);
    expect(() => pgConfig(SUPA, { DATABASE_SSL: 'maybe' })).toThrow(/off, require, verify/);
  });
});
