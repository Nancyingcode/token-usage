import { describe, expect, it } from 'vitest';
import { compareStableAppVersions, isStableAppVersion } from '../src/shared/appUpdatePolicy';

describe('stable application update versions', () => {
  it.each(['0.0.0', '0.10.0', '999999999999999999999.0.1'])('accepts %s', (version) => {
    expect(isStableAppVersion(version)).toBe(true);
  });

  it.each([
    '',
    '1.0',
    '1.0.0.0',
    '01.0.0',
    '1.00.0',
    '-1.0.0',
    '1.0.0-beta.1',
    '1.0.0+build',
    'v1.0.0',
    '1.0.0\n',
    ' 1.0.0',
    '1.0.x',
    null,
    1,
  ])('rejects unsupported version %s', (version) => {
    expect(isStableAppVersion(version)).toBe(false);
  });

  it.each([
    ['0.9.0', '0.10.0', 'newer'],
    ['1.9.0', '1.10.0', 'newer'],
    ['10.0.0', '9.99.99', 'older'],
    ['1.0.10', '1.0.9', 'older'],
    ['1.2.3', '1.2.3', 'same'],
    ['99999999999999999999.0.0', '100000000000000000000.0.0', 'newer'],
    ['1.0.0', '1.0.1-beta', 'invalid'],
    ['bad', '1.0.0', 'invalid'],
  ])('compares %s with %s numerically', (installed, candidate, expected) => {
    expect(compareStableAppVersions(installed, candidate)).toBe(expected);
  });
});
